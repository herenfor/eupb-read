import { sanitizeChapter, VIEWER_ID } from "./sanitize";
import { resolvePath, isExternalUrl, isFragmentOnly, splitHref } from "../core/paths";
import { isFootnoteLink, resolveFootnote } from "./footnotes";
import type { ResourceServer } from "./resources";
import { TEXT_MEASURE, type ReaderSettings } from "./settings";

export type ChapterState =
  | { status: "loading" }
  | { status: "measuring" }
  | { status: "ready"; pageCount: number; currentPage: number; empty: boolean }
  | { status: "error"; message: string };

export interface LoadOptions {
  /** 跳转到页内锚点（目录跳转用） */
  anchor?: string;
}

/**
 * 单章分页控制器：把一章 XHTML 渲染进 iframe，用 CSS 多栏布局分页。
 *
 * 核心机制（同源 blob iframe，父窗口可直接操作内容 DOM）：
 * 1. sanitizeChapter 产出注入过阅读器样式/CSP 的 HTML，blob URL 赋给 iframe.src
 * 2. iframe load 后（子资源已就绪），等待 document.fonts.ready
 * 3. 容器全宽，列宽 = 页宽；正文版心由注入 CSS 的 em 上限居中控制
 * 4. 页数 = 内容占据的列数；翻页 = 调 scrollLeft
 * 5. 阅读位置用"内容锚点"保留：页中心取样元素 + 元素内横向比例，
 *    重排/重载后按比例映射回新布局，保证正在读的行保持在页面中部
 */
/** 叶子文本长度（无元素子级的元素文本；父容器不重复计数）。 */
function leafTextLen(el: HTMLElement): number {
  if (el.children.length === 0) return (el.textContent ?? "").replace(/\s/g, "").length;
  let n = 0;
  for (const c of Array.from(el.children)) n += leafTextLen(c as HTMLElement);
  return n;
}

export class ChapterPaginator {
  private blobUrl?: string;
  private viewer: HTMLElement | null = null;
  private contentDoc: Document | null = null;
  private step = 0;
  private pageWidth = 0;
  private metrics = { pageCount: 1, currentPage: 0 };
  private loadSeq = 0;
  private disposed = false;
  private reflowTimer: number | undefined;
  private imgHandler = (): void => this.scheduleReflow();
  private linkHandler = (e: Event): void => this.handleLinkClick(e);
  private wheelHandler = (e: WheelEvent): void => this.handleWheel(e);
  private wheelAcc = 0;
  private keyHandler = (e: KeyboardEvent): void => this.handleKey(e);
  private footnoteHoverInHandler = (e: Event): void => this.handleFootnoteHoverIn(e);
  private footnoteHoverOutHandler = (e: MouseEvent): void => this.handleFootnoteHoverOut(e);
  private pendingAnchor: string | undefined;
  private lastState: ChapterState = { status: "loading" };
  private recomputeRetries = 0;
  /** reflow 序号：丢弃过期测量结果，防快速缩放时旧布局覆盖新布局 */
  private reflowSeq = 0;
  /** 最近点击的脚注标记元素（供弹层随重排重新定位） */
  private lastFootnoteEl: HTMLElement | null = null;
  /** 第二遍 margin 处理写回过的元素与原始 inline 值（下次测量前恢复） */
  private marginFixes: Array<{
    el: HTMLElement;
    left: string;
    right: string;
  }> = [];
  /** fit-content 补偿写回过的元素与原始 inline max-width（下次测量前恢复） */
  private fitContentFixes: Array<{ el: HTMLElement; maxWidth: string }> = [];
  /** float 收缩补偿写回过的元素（下次测量前清除 width） */
  private floatFixes: HTMLElement[] = [];

  /** 阅读位置锚点：页中心元素（子树元素序号 + 元素内横向比例 + 字数位置） */
  private anchor: {
    index: number;
    ratio: number;
    charsRead: number;
    totalChars: number;
  } | null = null;
  private anchorPath: string | undefined;

  constructor(
    private iframe: HTMLIFrameElement,
    private server: ResourceServer,
    private settings: ReaderSettings,
    private strictXml: boolean,
    private onState: (s: ChapterState) => void,
    private onIssues?: (issues: string[]) => void,
    /** 固定版式书：不做行宽自适应，整页显示 */
    private fixedLayout = false,
    /** 书内链接点击回调（已解析为书内路径，含可选锚点），供阅读器跳转 */
    private onNavigate?: (href: string) => void,
    /** 滚轮翻页回调（累积阈值后触发，1=下一页 -1=上一页） */
    private onWheelNavigate?: (dir: 1 | -1) => void,
    /** 键盘翻页回调（焦点在书页内时也有效） */
    private onKeyNavigate?: (dir: 1 | -1) => void,
    /** 脚注点击回调（文本 + 标记在 iframe 内的视口矩形，由阅读器弹层定位显示） */
    private onFootnote?: (
      text: string,
      rect: { left: number; top: number; right: number; bottom: number }
    ) => void,
    /** 桌面端 hover 离开脚注标记时关闭弹层（移动端无 hover，弹层由点击/✕ 关闭） */
    private onFootnoteClose?: () => void,
    /** 外部链接（http/https/mailto/tel）点击回调，由 App 层调系统默认浏览器打开 */
    private onExternalLink?: (url: string) => void
  ) {}

  /** 加载一章。path 为规范化内部路径。 */
  async load(path: string, opts: LoadOptions = {}): Promise<void> {
    const seq = ++this.loadSeq;
    this.disposed = false;
    this.recomputeRetries = 0;
    // 换章加载：丢弃旧锚点与旧页号（页号只对同章重排有意义，
    // 否则新章会沿袭上一章的页号，如"上一章13页→下一章也跳到第13页"）
    if (path !== this._currentPath) {
      this.anchor = null;
      this.anchorPath = undefined;
      this.metrics.currentPage = 0;
    }
    this._currentPath = path;
    this.pendingAnchor = opts.anchor;
    this.emit({ status: "loading" });
    this.iframe.removeEventListener("load", this.onIframeLoad);
    this.cleanupDoc();
    this.iframe.src = "about:blank";

    const htmlText = this.server.textFor(path);
    if (htmlText === undefined) {
      this.emit({ status: "error", message: `章节资源缺失：${path}` });
      return;
    }

    let sanitized;
    try {
      sanitized = await sanitizeChapter(htmlText, {
        basePath: path,
        strictXml: this.strictXml,
        urlFor: (p) => this.server.urlFor(p),
        getText: (p) => this.server.textFor(p),
        makeUrl: (text, mediaType) =>
          URL.createObjectURL(new Blob([text], { type: mediaType })),
        settings: this.settings,
      });
    } catch (e) {
      if (seq === this.loadSeq) {
        this.emit({ status: "error", message: `章节渲染失败：${(e as Error).message}` });
      }
      return;
    }
    if (seq !== this.loadSeq || this.disposed) return;
    if (sanitized.issues.length > 0) this.onIssues?.(sanitized.issues);

    this.blobUrl = URL.createObjectURL(
      new Blob([sanitized.html], { type: "text/html; charset=utf-8" })
    );
    this.iframe.addEventListener("load", this.onIframeLoad);
    this.iframe.src = this.blobUrl;
  }

  private onIframeLoad = (): void => {
    const seq = this.loadSeq;
    if (!this.blobUrl || !this.iframe.src.startsWith("blob:")) return; // 忽略 about:blank 的 load
    const doc = this.iframe.contentDocument;
    if (!doc) {
      this.emit({ status: "error", message: "无法访问章节内容" });
      return;
    }
    this.contentDoc = doc;
    const viewer = doc.getElementById(VIEWER_ID);
    if (!viewer) {
      this.emit({ status: "error", message: "章节缺少阅读器容器" });
      return;
    }
    this.viewer = viewer;
    this.emit({ status: "measuring" });
    doc.addEventListener("load", this.imgHandler, true);
    // 拦截书内链接：防止 iframe 自身导航导致内容丢失
    doc.addEventListener("click", this.linkHandler, true);
    // 桌面 hover 弹注（script.js 的鼠标行为）；移动端无 hover，走 click/touch
    doc.addEventListener("mouseover", this.footnoteHoverInHandler, true);
    doc.addEventListener("mouseout", this.footnoteHoverOutHandler, true);
    // 滚轮翻页（内容不可滚动，事件冒泡到文档即可捕获）
    doc.addEventListener("wheel", this.wheelHandler, { passive: false });
    // 键盘翻页：焦点在书页内时，方向键事件不会冒泡到主窗口，需在此监听
    doc.addEventListener("keydown", this.keyHandler);
    void this.measure().then(() => {
      if (seq !== this.loadSeq || this.disposed) return;
      this.recompute(true);
      // 目录跳转：定位到锚点所在页
      if (this.pendingAnchor) {
        this.jumpToAnchor(this.pendingAnchor);
        this.pendingAnchor = undefined;
      }
    });
  };

  /** 设置分栏并等待字体就绪后测量（带超时保护：任何一步挂起都不能阻塞 ready）。 */
  private async measure(): Promise<void> {
    const doc = this.contentDoc;
    const viewer = this.viewer;
    if (!doc || !viewer) return;
    // 第二遍 margin / fit-content 处理写回的 inline 值要先恢复，
    // 避免字号/窗口变化后按旧值布局
    this.restoreBookMargins();
    this.restoreFitContentFix();
    this.restoreFloatWidths();
    const parent = viewer.parentElement;
    const parentCs = parent && doc.defaultView ? doc.defaultView.getComputedStyle(parent) : null;
    const baseW = parent?.clientWidth || this.iframe.clientWidth || viewer.clientWidth;
    // 书可能声明 body padding（如 LK 的 0 5px），分页宽度要用内容区宽度，
    // 否则 viewer 会溢出 body 右侧，出现横向滚动条。
    const pageW = Math.max(
      0,
      baseW -
        (parseFloat(parentCs?.paddingLeft ?? "") || 0) -
        (parseFloat(parentCs?.paddingRight ?? "") || 0)
    );
    const em = this.settings.fontSizePx;
    // 容器全宽：正文版心由注入 CSS 的 em 上限居中控制，
    // 全页图块（.illus 等）豁免限制、占满整页
    const w = pageW;
    // 纯图片页（封面/插图，无文字）：不加上下留白，整页显示
    const hasText = (viewer.textContent ?? "").trim().length > 0;
    const hasImg = viewer.querySelector("img") !== null;
    const gap = this.settings.gapPx;
    this.pageWidth = w;
    this.step = w + gap;
    viewer.style.width = `${w}px`;
    if (this.fixedLayout || (!hasText && hasImg)) {
      viewer.style.paddingTop = "0px";
      viewer.style.paddingBottom = "0px";
    } else {
      viewer.style.paddingTop = `${TEXT_MEASURE.vTopEm * em}px`;
      viewer.style.paddingBottom = `${TEXT_MEASURE.vBottomEm * em}px`;
    }
    viewer.style.columnWidth = `${w}px`;
    viewer.style.columnGap = `${gap}px`;
    viewer.style.columnFill = "auto";
    viewer.style.height = "100%";
    // 同步回流一次，确保 scrollWidth 反映新布局
    void viewer.scrollWidth;
    const timeout = (ms: number): Promise<void> =>
      new Promise((r) => setTimeout(r, ms));
    try {
      // fonts.ready 极端情况下可能挂起（字体请求异常），5s 超时兜底
      await Promise.race([doc.fonts.ready, timeout(5000)]);
    } catch {
      /* 字体 API 不可用时直接继续 */
    }
    // 布局稳定后再读一次（rAF 同样加超时兜底）
    await Promise.race([
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      ),
      timeout(2000),
    ]);
    this.applyBookMargins();
    this.applyFitContentFix();
    this.applyFloatShrinkFix();
  }

  /** 恢复上一轮 margin 后处理写回的 inline 值。 */
  private restoreBookMargins(): void {
    for (const fix of this.marginFixes) {
      fix.el.removeAttribute("data-reader-margin-fixed");
      if (fix.left === "") fix.el.style.removeProperty("margin-left");
      else fix.el.style.setProperty("margin-left", fix.left);
      if (fix.right === "") fix.el.style.removeProperty("margin-right");
      else fix.el.style.setProperty("margin-right", fix.right);
    }
    this.marginFixes = [];
  }

  /**
   * 第二遍 margin 处理（C-04）：
   * 先让阅读器默认居中规则渲染（第一遍已发生），再检查页面直接子元素
   * 在“纯书 CSS”下是否有非零左右 margin；有则写回书的真实 margin，
   * 否则保持阅读器默认居中。书的通用 reset（div{margin:0}）得到的是 0，
   * 不会进入写回，因此不会被误判为具体布局。
   */
  private applyBookMargins(): void {
    const doc = this.contentDoc;
    const viewer = this.viewer;
    if (!doc || !viewer || !doc.defaultView) return;
    const win = doc.defaultView;

    const readerSheet = Array.from(doc.styleSheets).find(
      (s) => (s.ownerNode as Element | null)?.getAttribute?.("data-reader") === "overrides"
    );
    const candidates = Array.from(viewer.children).filter(
      (c): c is HTMLElement =>
        c.nodeType === 1 &&
        !c.classList.contains("illus") &&
        !c.classList.contains("kuchie") &&
        !c.classList.contains("cover") &&
        !c.classList.contains("duokan-image-single") &&
        !c.classList.contains("duokan-image-fullscreen")
    );
    if (candidates.length === 0) return;

    // 第一遍：记录阅读器默认居中后的元素宽度与原始 max-width 意图。
    // 注意：多栏里元素若跨列碎片，getBoundingClientRect().width 会把碎片
    // 并成一个超宽矩形，必须用 computed width。
    const widths = new Map<HTMLElement, number>();
    const maxWidths = new Map<HTMLElement, string>();
    for (const el of candidates) {
      void el.offsetWidth;
      const cs = win.getComputedStyle(el);
      const usedW = parseFloat(cs.width);
      widths.set(
        el,
        Number.isFinite(usedW) && usedW > 0 ? usedW : el.getBoundingClientRect().width
      );
      maxWidths.set(el, cs.maxWidth);
    }

    if (readerSheet) readerSheet.disabled = true;
    try {
      for (const el of candidates) {
        // 同一测量周期内已修正过则跳过，避免把上次写回的 margin
        // 再当成书 margin 叠加一次（导致 namebox 732/-32 这类错误）。
        if (el.hasAttribute("data-reader-margin-fixed")) continue;
        void el.offsetWidth;
        const cs = win.getComputedStyle(el);
        const left = cs.marginLeft;
        const right = cs.marginRight;
        const parent = el.parentElement;
        const parentCs = parent && doc.defaultView ? doc.defaultView.getComputedStyle(parent) : null;
        const parentW =
          (parent?.clientWidth ?? viewer.clientWidth) -
          (parseFloat(parentCs?.paddingLeft ?? "") || 0) -
          (parseFloat(parentCs?.paddingRight ?? "") || 0);
        const width = widths.get(el) ?? el.getBoundingClientRect().width;
        const meaningful = (v: string): boolean =>
          v !== "auto" && v !== "" && parseFloat(v) !== 0;
        const originalMaxWidth = maxWidths.get(el) ?? "";

        // 书明确写了“收缩到内容宽度”（fit-content / max-content）且没有
        // 左右 margin：这是左对齐的内容容器，应放到版心列左缘，而不是
        // 被 L3 强制居中或贴在窗口最左。
        if (
          !meaningful(left) &&
          !meaningful(right) &&
          /(?:fit-content|max-content)/.test(originalMaxWidth)
        ) {
          const columnW = TEXT_MEASURE.maxEm * this.settings.fontSizePx;
          const desiredLeft = Math.max(0, (parentW - columnW) / 2);
          this.marginFixes.push({
            el,
            left: el.style.marginLeft,
            right: el.style.marginRight,
          });
          el.setAttribute("data-reader-margin-fixed", "1");
          el.style.setProperty("margin-left", `${desiredLeft}px`, "important");
          el.style.setProperty(
            "margin-right",
            `${parentW - desiredLeft - width}px`,
            "important"
          );
          continue;
        }

        if (!meaningful(left) && !meaningful(right)) continue;

        const autoCenter = (parentW - width) / 2;
        const autoLike =
          parseFloat(left) !== 0 &&
          Math.abs(parseFloat(left) - parseFloat(right)) < 0.5 &&
          Math.abs(parseFloat(left) - autoCenter) < 0.5;
        if (autoLike) continue;

        // 把书的不对称 margin 解释为“相对居中版心列的缩进”：
        // 正文列左缘 = (parent - width)/2；书 margin-left:2em 意味着
        // 元素左缘再缩进 2em，与正文首行 text-indent 对齐。
        const ml = parseFloat(left) || 0;
        const mr = parseFloat(right) || 0;
        const base = (parentW - width) / 2;
        let desiredLeft: number;
        let desiredRight: number;
        if (ml > 0) {
          desiredLeft = base + ml;
          desiredRight = parentW - desiredLeft - width;
        } else if (mr > 0) {
          desiredRight = base + mr;
          desiredLeft = parentW - desiredRight - width;
        } else {
          continue;
        }

        this.marginFixes.push({
          el,
          left: el.style.marginLeft,
          right: el.style.marginRight,
        });
        el.setAttribute("data-reader-margin-fixed", "1");
        el.style.setProperty("margin-left", `${desiredLeft}px`, "important");
        el.style.setProperty("margin-right", `${desiredRight}px`, "important");
      }
    } finally {
      if (readerSheet) readerSheet.disabled = false;
    }
  }

  /** 恢复上一轮 fit-content 补偿写回的 inline max-width。 */
  private restoreFitContentFix(): void {
    for (const fix of this.fitContentFixes) {
      fix.el.style.setProperty("max-width", fix.maxWidth);
    }
    this.fitContentFixes = [];
  }

  /**
   * L5-C09：CSS 多栏里 max-width:fit-content 计算异常（简介等会塌成
   * 逐字窄条或拉成整页宽）。统一把这类元素的上限改为版心 40rem，
   * 宽容器时得到正常版心宽度，窄容器时仍受父容器约束。
   */
  private applyFitContentFix(): void {
    const doc = this.contentDoc;
    const viewer = this.viewer;
    if (!doc || !viewer || !doc.defaultView) return;
    const win = doc.defaultView;
    for (const el of Array.from(viewer.querySelectorAll("*")) as HTMLElement[]) {
      if (el.closest(".illus, .kuchie, .cover, .duokan-image-single, .duokan-image-fullscreen")) {
        continue;
      }
      const mw = win.getComputedStyle(el).maxWidth;
      if (!mw.includes("fit-content")) continue;
      this.fitContentFixes.push({ el, maxWidth: el.style.maxWidth });
      el.style.setProperty("max-width", `${TEXT_MEASURE.maxEm}rem`);
    }
  }

  /** 清除上一轮 float 收缩补偿写回的 width。 */
  private restoreFloatWidths(): void {
    for (const el of this.floatFixes) el.style.removeProperty("width");
    this.floatFixes = [];
  }

  /**
   * L5-C08：CSS 多栏里浮动元素的 shrink-to-fit 异常（气泡塌成逐字宽）。
   * 用 Canvas 逐文本节点测量 max-content，按父容器可用宽度收缩并写回 px，
   * 恢复“短内容包住文字、长内容到边换行”。只处理纯 inline 内容的浮动
   * 元素；测量不到字体宽度（无可用字体）时跳过。
   */
  private applyFloatShrinkFix(): void {
    const doc = this.contentDoc;
    const viewer = this.viewer;
    if (!doc || !viewer || !doc.defaultView) return;
    const win = doc.defaultView;
    const canvas = doc.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const familiesOf = (fontFamily: string): string[] =>
      fontFamily
        .split(",")
        .map((f) => f.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);

    const textWidth = (text: string, parent: Element | null): number => {
      if (!text) return 0;
      const cs = parent ? win.getComputedStyle(parent) : null;
      const families = cs ? familiesOf(cs.fontFamily) : ["sans-serif"];
      const style = cs
        ? `${cs.fontWeight} ${cs.fontSize}`
        : "400 16px";
      for (const family of families) {
        ctx.font = `${style} ${family}`;
        const w = ctx.measureText(text).width;
        if (w > 0) return w;
      }
      return 0;
    };

    const measureNode = (node: Node): number => {
      if (node.nodeType === 3) {
        return textWidth(node.textContent ?? "", node.parentElement);
      }
      if (node.nodeType !== 1) return 0;
      const el = node as HTMLElement;
      if (el.tagName.toLowerCase() === "br") return 0;
      const cs = win.getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      if (tag !== "img" && tag !== "svg" && cs.display !== "inline") return 0;
      const r = el.getBoundingClientRect();
      if (r.width > 0) return r.width;
      const img = el as HTMLImageElement;
      if (img.naturalWidth) return img.naturalWidth;
      return 0;
    };

    for (const el of Array.from(viewer.querySelectorAll("*")) as HTMLElement[]) {
      const cs = win.getComputedStyle(el);
      if (cs.float === "none") continue;
      if (/\bwidth\s*:/.test(el.getAttribute("style") ?? "")) continue;
      // 只修复“塌缩成逐字宽”的浮动元素；已有明确宽度且正常布局
      // （如目录标题 width:100% + float:left）不处理。
      const currentWidth = parseFloat(cs.width);
      if (!Number.isFinite(currentWidth) || currentWidth > 48) continue;
      if (
        Array.from(el.children).some((c) => {
          const d = win.getComputedStyle(c as Element).display;
          return (
            d.startsWith("block") ||
            d.startsWith("list-item") ||
            d === "table" ||
            d === "flex"
          );
        })
      ) {
        continue;
      }
      let maxContent = 0;
      let lineWidth = 0;
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType === 1 && (n as HTMLElement).tagName.toLowerCase() === "br") {
          maxContent = Math.max(maxContent, lineWidth);
          lineWidth = 0;
          continue;
        }
        lineWidth += measureNode(n);
      }
      maxContent = Math.max(maxContent, lineWidth);
      if (maxContent <= 0) continue;
      const padding =
        (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const border =
        (parseFloat(cs.borderLeftWidth) || 0) +
        (parseFloat(cs.borderRightWidth) || 0);
      const parent = el.parentElement;
      const parentCs =
        parent && doc.defaultView ? doc.defaultView.getComputedStyle(parent) : null;
      const avail =
        (parent ? parent.clientWidth : viewer.clientWidth) -
        (parseFloat(parentCs?.paddingLeft ?? "") || 0) -
        (parseFloat(parentCs?.paddingRight ?? "") || 0) -
        (parseFloat(cs.marginLeft) || 0) -
        (parseFloat(cs.marginRight) || 0);
      const target = Math.max(0, Math.min(maxContent + padding + border, avail));
      el.style.setProperty("width", `${target}px`);
      this.floatFixes.push(el);
    }
  }

  private recompute(useAnchor: boolean): void {
    // 章节代号校验：切章后旧章的延迟重排（图片加载防抖等）一律丢弃，
    // 否则旧 DOM 的锚点/页数会污染新章（表现：卡死在上一章末页）
    const loadSeq = this.loadSeq;
    const viewer = this.viewer;
    if (!viewer || this.step <= 0) return;
    // 自愈：viewer 为空但 body 里还有内容（内容落在容器外）时，重新包裹
    if (viewer.children.length === 0) {
      const doc = this.contentDoc;
      const body = doc?.body;
      let moved = 0;
      if (body) {
        const nodes = Array.from(body.childNodes);
        for (const n of nodes) {
          if (n === viewer) continue;
          viewer.appendChild(n);
          moved++;
        }
      }
      if (moved > 0) {
        void this.measure().then(() => {
          if (!this.disposed && loadSeq === this.loadSeq) this.recompute(useAnchor);
        });
        return;
      }
    }
    const sw = viewer.scrollWidth;
    const hasContent =
      viewer.children.length > 0 || (viewer.textContent ?? "").trim().length > 0;
    if (sw <= 0 || !hasContent) {
      this.metrics = { pageCount: 1, currentPage: 0 };
      this.emit({ status: "ready", pageCount: 1, currentPage: 0, empty: true });
      return;
    }
    // 纵向裁剪检测：分栏未生效时内容会被 overflow:hidden 裁掉（scrollHeight > 高），
    // 重新应用分栏一次（最多重试 2 次，防死循环）
    if (viewer.scrollHeight > viewer.clientHeight + 1) {
      if (this.recomputeRetries < 2) {
        this.recomputeRetries++;
        void this.measure().then(() => {
          if (!this.disposed && loadSeq === this.loadSeq) this.recompute(useAnchor);
        });
        return;
      }
    }
    this.recomputeInner(useAnchor, loadSeq);
  }

  private recomputeInner(useAnchor: boolean, loadSeq: number): void {
    if (loadSeq !== this.loadSeq) return; // 过期章节：丢弃
    const viewer = this.viewer;
    if (!viewer || this.step <= 0) return;
    // 用内容实际占用的列范围计算页数（不依赖视口，elementFromPoint 对
    // 视口外列返回 null 会导致整列被误判为空）
    const extent = this.contentExtent();
    if (!Number.isFinite(extent.maxX) || extent.maxX <= 0) {
      this.metrics = { pageCount: 1, currentPage: 0 };
      this.emit({ status: "ready", pageCount: 1, currentPage: 0, empty: true });
      return;
    }
    const contentCols = Math.max(1, Math.ceil(extent.maxX / this.step));
    let pageCount = contentCols;
    // 前置空列：page-break-before:always 的首元素会把内容推到第 2 列
    const leadShift = Math.floor(extent.minX / this.step);
    if (leadShift > 0) {
      pageCount = Math.max(1, contentCols - leadShift);
    }
    // 阅读位置保留：窗口缩放/设置变化用内容锚点定位；
    // 图片加载等内容变化保留当前页号（否则内容下移会把人拉到后几页）
    const anchorCol = useAnchor ? this.resolveAnchorCol() : null;
    const current =
      anchorCol !== null
        ? Math.min(anchorCol, pageCount - 1)
        : Math.min(this.metrics.currentPage, pageCount - 1);
    this.metrics = { pageCount, currentPage: current };
    // 关键：重排（图片加载/窗口缩放）后对齐页边界，否则显示半页偏移错位
    viewer.scrollLeft = (leadShift + current) * this.step;
    this.emit({ status: "ready", pageCount, currentPage: current, empty: false });
    // 粘性锚点：使用锚点恢复时不重新取样（否则恢复后页心可能是下一段，
    // 反复缩放会逐段漂移）；仅当无锚点（首次加载）时建立
    if (anchorCol === null) this.captureAnchor();
  }

  /** 内容在列方向上的实际占用范围（内容坐标，视口无关）。 */
  private contentExtent(): { minX: number; maxX: number } {
    const viewer = this.viewer;
    let minX = Infinity;
    let maxX = -Infinity;
    if (!viewer) return { minX: 0, maxX: 0 };
    const scrollLeft = viewer.scrollLeft;
    for (const el of Array.from(viewer.querySelectorAll("*"))) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // display:none 等零尺寸元素
      const x0 = r.left + scrollLeft;
      const x1 = r.right + scrollLeft;
      if (x0 < minX) minX = x0;
      if (x1 > maxX) maxX = x1;
    }
    return { minX, maxX };
  }

  /**
   * 记录当前可见页中心的元素锚点（供重排后恢复阅读位置）。
   * 以页面正中间那 1-2 行为锚：视线焦点通常在页中，缩放后这些行
   * 仍应落在新页面的中部区域，保证阅读连续性。
   */
  private captureAnchor(): void {
    const doc = this.contentDoc;
    const viewer = this.viewer;
    if (!doc || !viewer || this.step <= 0 || viewer.clientWidth <= 0) return;
    const x = Math.min(viewer.clientWidth * 0.5, viewer.clientWidth - 2);
    const padTop = parseFloat(viewer.style.paddingTop || "0") || 0;
    // 页中心取样，向上就近回退直到页顶；仍未命中则取页顶元素
    let el: Element | null = null;
    let yy = viewer.clientHeight / 2;
    while (yy > 4 && !el) {
      const hit = doc.elementFromPoint(x, Math.max(2, yy));
      if (hit && hit !== viewer && hit !== doc.body && hit !== doc.documentElement) {
        el = hit;
      }
      yy -= 40;
    }
    if (!el) {
      const hit = doc.elementFromPoint(x, Math.min(padTop + 4, viewer.clientHeight - 2));
      if (hit && hit !== viewer && hit !== doc.body && hit !== doc.documentElement) {
        el = hit;
      }
    }
    if (!el) return;
    const all = Array.from(viewer.querySelectorAll("*"));
    const idx = all.indexOf(el as HTMLElement);
    if (idx < 0) return;
    // 可见点在元素总宽度中的横向比例（跨列长段落按比例映射，
    // 字号变化后段落重排，比例仍近似对应同一处内容）
    const rect = (el as HTMLElement).getBoundingClientRect();
    const ratio =
      rect.width > 0 ? Math.min(1, Math.max(0, (x - rect.left) / rect.width)) : 0;
    // 字数位置：叶子文本累计（父容器不重复计数），供内容进度推算
    let charsRead = 0;
    for (let i = 0; i < idx; i++) charsRead += leafTextLen(all[i] as HTMLElement);
    charsRead += ratio * leafTextLen(el as HTMLElement);
    const totalChars = (viewer.textContent ?? "").replace(/\s/g, "").length;
    this.anchor = { index: idx, ratio, charsRead, totalChars };
    this.anchorPath = this._currentPath;
  }

  /** 锚点元素当前所在列（同章且锚点存在时返回列号，否则 null）。 */
  private resolveAnchorCol(): number | null {
    const doc = this.contentDoc;
    const viewer = this.viewer;
    if (!doc || !viewer || !this.anchor || this.step <= 0) return null;
    if (this.anchorPath !== this._currentPath) return null;
    const all = Array.from(viewer.querySelectorAll("*"));
    const el = all[Math.min(this.anchor.index, all.length - 1)] as HTMLElement | undefined;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // 元素首片段（内容坐标）+ 按比例映射到新布局宽度 → 目标列
    const absX = rect.left + viewer.scrollLeft + this.anchor.ratio * rect.width;
    return Math.max(0, Math.floor(absX / this.step));
  }

  /** 翻到第 i 页（自动夹紧）。 */
  setPage(i: number): void {
    if (!this.viewer) return;
    const { pageCount } = this.metrics;
    const target = Math.max(0, Math.min(pageCount - 1, Math.floor(i)));
    this.viewer.scrollLeft = target * this.step;
    this.metrics.currentPage = target;
    // 空章判定只由 recompute 负责（此处标记 false，避免误触发自动跳章）
    this.emit({ status: "ready", pageCount, currentPage: target, empty: false });
    this.captureAnchor();
  }

  /** 跳到页内锚点（元素所在列）。 */
  jumpToAnchor(anchor: string): void {
    const doc = this.contentDoc;
    const viewer = this.viewer;
    if (!doc || !viewer) return;
    const el = doc.getElementById(anchor);
    if (!el || this.step <= 0) return;
    const rect = el.getBoundingClientRect();
    const x = rect.left + viewer.scrollLeft;
    this.setPage(Math.floor(x / this.step));
  }

  /** 当前阅读锚点（供阅读记录持久化与内容进度推算）。 */
  getReadingAnchor(): {
    path: string;
    index: number;
    ratio: number;
    charsRead: number;
    totalChars: number;
  } | null {
    if (!this.anchor || !this.anchorPath) return null;
    return {
      path: this.anchorPath,
      index: this.anchor.index,
      ratio: this.anchor.ratio,
      charsRead: this.anchor.charsRead,
      totalChars: this.anchor.totalChars,
    };
  }

  /** 恢复阅读锚点（打开书时定位到上次阅读处）。 */
  setReadingAnchor(
    a:
      | { path: string; index: number; ratio: number; charsRead?: number; totalChars?: number }
      | null
      | undefined
  ): void {
    if (a && a.path) {
      this.anchor = {
        index: a.index,
        ratio: a.ratio,
        charsRead: a.charsRead ?? 0,
        totalChars: a.totalChars ?? 0,
      };
      this.anchorPath = a.path;
    } else {
      this.anchor = null;
      this.anchorPath = undefined;
    }
  }

  get pageCount(): number {
    return this.metrics.pageCount;
  }

  get currentPage(): number {
    return this.metrics.currentPage;
  }

  /** 设置变更（字号/主题）后整体重载（保留阅读位置）。 */
  async reloadWithSettings(settings: ReaderSettings, anchor?: string): Promise<void> {
    this.settings = settings;
    const path = this.currentPath;
    if (!path) return;
    this.captureAnchor();
    await this.load(path, { anchor });
  }

  private get currentPath(): string {
    return this._currentPath;
  }

  private _currentPath = "";

  private scheduleReflow(): void {
    if (this.reflowTimer !== undefined) window.clearTimeout(this.reflowTimer);
    const seq = this.loadSeq;
    this.reflowTimer = window.setTimeout(() => {
      this.reflowTimer = undefined;
      if (!this.disposed && seq === this.loadSeq) this.recompute(false);
    }, 200);
  }

  /** 外部触发重排（窗口尺寸变化等）。
   *  不捕获锚点：直接使用上一次稳定状态存下的锚点（缩放前的位置）。 */
  reflow(): void {
    if (this.disposed) return;
    const seq = ++this.reflowSeq;
    const loadSeq = this.loadSeq;
    void this.measure().then(() => {
      // 过期测量（更早发起、更晚完成/切章后）直接丢弃，防布局/位置被覆写
      if (!this.disposed && seq === this.reflowSeq && loadSeq === this.loadSeq) {
        this.recompute(true);
      }
    });
  }

  /** 键盘翻页（书页内焦点）。 */
  private handleKey(e: KeyboardEvent): void {
    const k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || k === " ") {
      e.preventDefault();
      this.onKeyNavigate?.(1);
    } else if (k === "ArrowLeft" || k === "PageUp") {
      e.preventDefault();
      this.onKeyNavigate?.(-1);
    }
  }

  /** 滚轮翻页：累积 deltaY，超过阈值翻一页（触控板连续小增量也能工作）。 */
  private handleWheel(e: WheelEvent): void {
    if (e.deltaY === 0) return;
    this.wheelAcc += e.deltaY;
    const threshold = 80;
    if (this.wheelAcc >= threshold) {
      this.wheelAcc = 0;
      e.preventDefault();
      this.onWheelNavigate?.(1);
    } else if (this.wheelAcc <= -threshold) {
      this.wheelAcc = 0;
      e.preventDefault();
      this.onWheelNavigate?.(-1);
    }
  }

  /** 书内链接点击处理：阻止 iframe 导航，路由到阅读器跳转。 */
  private handleLinkClick(e: Event): void {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const a = t.closest<HTMLAnchorElement>("a");
    if (!a) return;
    const href = (a.getAttribute("href") ?? "").trim();
    if (!href) return;
    // 一律拦截：书内链接走阅读器，外部链接不跳转（防 iframe 被导航走）
    e.preventDefault();
    e.stopPropagation();
    if (isExternalUrl(href) || href.startsWith("//")) {
      const url = href.startsWith("//") ? `https:${href}` : href;
      // 只放行可由系统默认应用安全打开的协议；data:/blob:/file: 等保持忽略
      if (/^(https?|mailto|tel):/i.test(url)) this.onExternalLink?.(url);
      return;
    }
    // 脚注标记：多看/掌阅式 + script.js 的 <note><sup><a href="#asideId"> 通用模式
    if (isFootnoteLink(a) && this.contentDoc) {
      const info = resolveFootnote(this.contentDoc, a);
      if (info) {
        this.showFootnote(a, info.text);
        return;
      }
    }
    if (isFragmentOnly(href)) {
      this.jumpToAnchor(href.slice(1));
      return;
    }
    const { path, anchor } = splitHref(href);
    const resolved = resolvePath(this._currentPath, path);
    this.onNavigate?.(anchor ? `${resolved}#${anchor}` : resolved);
  }

  /** 显示脚注弹层：记录标记（供重排重定位）并通知阅读器。 */
  private showFootnote(a: HTMLAnchorElement, text: string): void {
    this.lastFootnoteEl = a;
    const r = a.getBoundingClientRect();
    this.onFootnote?.(text, {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
    });
  }

  /** 桌面 hover 弹注（script.js 的 mouseover 行为）。 */
  private handleFootnoteHoverIn(e: Event): void {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a");
    if (!a || !this.contentDoc || !isFootnoteLink(a)) return;
    const info = resolveFootnote(this.contentDoc, a);
    if (info) this.showFootnote(a, info.text);
  }

  /** hover 移出标记时关闭弹层；在标记内部移动不关闭。 */
  private handleFootnoteHoverOut(e: MouseEvent): void {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a");
    if (!a || !isFootnoteLink(a)) return;
    const rel = e.relatedTarget as Node | null;
    if (rel && a.contains(rel)) return;
    this.onFootnoteClose?.();
  }

  /** 当前脚注标记在 iframe 内的视口矩形（弹层随重排重定位用）；无则 null。 */
  getFootnoteMarkerRect(): { left: number; top: number; right: number; bottom: number } | null {
    if (!this.lastFootnoteEl || !this.lastFootnoteEl.isConnected) return null;
    const r = this.lastFootnoteEl.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  /** 渲染诊断：输出当前章节的分页/布局关键数据（浏览器内调试用）。 */
  diagnose(): string {
    const doc = this.contentDoc;
    const viewer = this.viewer;
    const lines: string[] = [];
    lines.push(`state=${JSON.stringify(this.lastState)}`);
    lines.push(
      `step=${this.step} pageWidth=${this.pageWidth} metrics=${JSON.stringify(this.metrics)}`
    );
    lines.push(
      `iframe=${this.iframe.clientWidth}x${this.iframe.clientHeight} src=${String(this.iframe.src).slice(0, 36)}`
    );
    if (doc && viewer) {
      const cs = doc.defaultView ? doc.defaultView.getComputedStyle(viewer) : null;
      lines.push(
        `viewer=${viewer.clientWidth}x${viewer.clientHeight} sw=${viewer.scrollWidth} sh=${viewer.scrollHeight} scrollLeft=${viewer.scrollLeft}`
      );
      if (cs) {
        lines.push(
          `colW=${cs.columnWidth} colCount=${cs.columnCount} colFill=${cs.columnFill} overflow=${cs.overflow}`
        );
      }
      lines.push(`children=${viewer.children.length} textLen=${(viewer.textContent ?? "").trim().length}`);
      const imgs = Array.from(viewer.querySelectorAll("img"))
        .slice(0, 6)
        .map((im) => {
          const r = (im as HTMLElement).getBoundingClientRect();
          return `${im.getAttribute("alt") || "-"}:${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`;
        })
        .join(" ");
      lines.push(`imgs=${imgs || "none"}`);
      // 布局排障辅助：fit-content 在多栏里常异常；宽出栏宽的元素也需要列出来
      const fitContentEls = Array.from(viewer.querySelectorAll("*"))
        .filter((el) => {
          const mw = doc.defaultView?.getComputedStyle(el as Element).maxWidth ?? "";
          return mw.includes("fit-content");
        })
        .slice(0, 5)
        .map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return `${(el as Element).tagName.toLowerCase()}.${(el as Element).getAttribute("class") ?? ""}:${Math.round(r.width)}px`;
        })
        .join(" ");
      lines.push(`fitContentEls=${fitContentEls || "none"}`);
      const wideEls = Array.from(viewer.querySelectorAll("*"))
        .filter((el) => {
          // 多栏里 getBoundingClientRect 会把跨列碎片并成一个超宽矩形，
          // 用 computed width 判断“真实盒宽”是否超栏，避免碎片误报。
          const w = parseFloat(doc.defaultView?.getComputedStyle(el as Element).width ?? "");
          return Number.isFinite(w) && w > this.step + 1;
        })
        .slice(0, 5)
        .map((el) => {
          const w = parseFloat(doc.defaultView?.getComputedStyle(el as Element).width ?? "");
          return `${(el as Element).tagName.toLowerCase()}.${(el as Element).getAttribute("class") ?? ""}:${Math.round(w)}px`;
        })
        .join(" ");
      lines.push(`wideEls=${wideEls || "none"}`);
      lines.push(`sheets=${doc.styleSheets.length}`);
      const fonts = (doc as unknown as { fonts?: { status?: string } }).fonts;
      lines.push(`fontsStatus=${fonts?.status ?? "n/a"}`);
      const anchorInfo = this.anchor
        ? `anchor idx=${this.anchor.index} ratio=${this.anchor.ratio.toFixed(3)} path=${this.anchorPath}`
        : "anchor=null";
      lines.push(anchorInfo);
      const body = doc.body;
      if (body) {
        lines.push(`bodyChildren=${body.children.length}`);
        lines.push(`bodyHtml=${body.outerHTML.replace(/\s+/g, " ").slice(0, 300)}`);
      }
      lines.push(`viewerHtml=${viewer.outerHTML.replace(/\s+/g, " ").slice(0, 200)}`);
      const links = Array.from(doc.getElementsByTagName("link"))
        .map((l) => (l as HTMLLinkElement).getAttribute("href"))
        .join(" , ");
      lines.push(`linkHrefs=${links}`);
    } else {
      lines.push("viewer=null（章节尚未加载）");
    }
    return lines.join("\n");
  }

  private cleanupDoc(): void {
    this.lastFootnoteEl = null;
    this.contentDoc?.removeEventListener("load", this.imgHandler, true);
    this.contentDoc?.removeEventListener("click", this.linkHandler, true);
    this.contentDoc?.removeEventListener("wheel", this.wheelHandler);
    this.contentDoc?.removeEventListener("keydown", this.keyHandler);
    this.contentDoc?.removeEventListener("mouseover", this.footnoteHoverInHandler, true);
    this.contentDoc?.removeEventListener("mouseout", this.footnoteHoverOutHandler, true);
    this.contentDoc = null;
    this.viewer = null;
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = undefined;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.loadSeq++;
    window.clearTimeout(this.reflowTimer);
    this.iframe.removeEventListener("load", this.onIframeLoad);
    this.cleanupDoc();
    this.iframe.src = "about:blank";
  }

  private emit(s: ChapterState): void {
    this.lastState = s;
    if (!this.disposed) this.onState(s);
  }
}
