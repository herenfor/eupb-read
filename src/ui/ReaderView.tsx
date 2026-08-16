import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Book } from "../core/types";
import { nextLinearIndex, spineItemPath } from "../core/book";
import { ChapterPaginator, type ChapterState } from "../render/paginator";
import type { ResourceServer } from "../render/resources";
import type { ReaderSettings } from "../render/settings";

export interface ReaderHandle {
  nextPage(): void;
  prevPage(): void;
  setPage(i: number): void;
  /** 渲染诊断文本（浏览器内调试） */
  diagnose(): string;
  /** 当前阅读锚点（进度持久化与内容进度） */
  getReadingAnchor(): {
    path: string;
    index: number;
    ratio: number;
    charsRead: number;
    totalChars: number;
  } | null;
  /** 脚注标记当前矩形（阅读区坐标系），弹层随重排重定位用。 */
  getFootnoteMarkerRect(): {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null;
}

interface ReaderViewProps {
  book: Book;
  server: ResourceServer;
  spineIndex: number;
  /** 目录跳转的页内锚点（随章节切换一起更新） */
  anchor?: string;
  /** 锚点变更序号：同章节重复跳转时强制重载 */
  anchorNonce: number;
  settings: ReaderSettings;
  onPageState(s: ChapterState): void;
  /** 请求切换到相邻章节（next/prev 或空章自动前进） */
  onRequestChapter(index: number, opts?: { atEnd?: boolean }): void;
  /** 章节切换请求（nonce 单调递增；atEnd=true 表示加载完成后翻到最后一页） */
  startAtEnd: { nonce: number; atEnd: boolean };
  onIssues(issues: string[]): void;
  /** 书内链接跳转（已解析为书内路径，含可选 #anchor） */
  onInternalLink(href: string): void;
  /** 外部链接（http/https/mailto/tel）交给系统默认浏览器/应用打开 */
  onExternalLink(url: string): void;
  /** 脚注弹层（文本 + 标记在阅读区坐标系的矩形） */
  onFootnote(
    text: string,
    rect: { left: number; top: number; right: number; bottom: number }
  ): void;
  /** 桌面端 hover 移出脚注标记时关闭弹层 */
  onFootnoteClose(): void;
  /** 打开书时恢复的阅读锚点（可选，页码之外的精确定位） */
  initialAnchor?: { index: number; ratio: number } | null;
}

function parseViewport(vp: string | undefined): { w: number; h: number } | null {
  if (!vp) return null;
  const m = /^(\d+)\s*[xX,]\s*(\d+)$/.exec(vp.trim());
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

export const ReaderView = forwardRef<ReaderHandle, ReaderViewProps>(function ReaderView(
  props,
  ref
) {
  const { book, server, spineIndex, settings } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const paginatorRef = useRef<ChapterPaginator | null>(null);
  const spineIndexRef = useRef(spineIndex);
  const autoAdvanceRef = useRef(false);
  const startAtEndRef = useRef(false);
  const lastStateRef = useRef<string>("loading");

  spineIndexRef.current = spineIndex;

  // 每次请求（nonce 变化）时按 atEnd 武装；消费后归 false，渲染不再重武装
  useEffect(() => {
    if (props.startAtEnd.atEnd) {
      startAtEndRef.current = true;
    }
  }, [props.startAtEnd]);

  // 固定版式：分栏间距为 0（每章整页显示）
  const effSettings: ReaderSettings =
    book.fixedLayout || settings.gapPx === 0
      ? { ...settings, gapPx: 0 }
      : settings;

  // 创建分页器（book/server 就绪后；App 端用 key 保证 book 变化时整体重建）
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const p = new ChapterPaginator(
      iframe,
      server,
      effSettings,
      book.version === 2,
      (s) => {
        lastStateRef.current = s.status;
        props.onPageState(s);
        if (s.status !== "ready") return;
        // 向前回翻：进入上一章时直接翻到最后一页
        if (startAtEndRef.current) {
          startAtEndRef.current = false;
          if (s.pageCount > 1) p.setPage(s.pageCount - 1);
        }
        // 空章节：自动前进到下一线性章
        if (s.empty && !autoAdvanceRef.current) {
          autoAdvanceRef.current = true;
          const next = nextLinearIndex(book, spineIndexRef.current, 1);
          if (next >= 0) props.onRequestChapter(next);
        }
      },
      (issues) => props.onIssues(issues),
      book.fixedLayout,
      (href) => props.onInternalLink(href),
      (dir) => turnPageRef.current(dir),
      (dir) => turnPageRef.current(dir),
      (text, rect) => {
        const iframe = iframeRef.current;
        const main = iframe?.parentElement;
        if (!iframe || !main) {
          props.onFootnote(text, rect);
          return;
        }
        const ir = iframe.getBoundingClientRect();
        const mr = main.getBoundingClientRect();
        const dx = ir.left - mr.left;
        const dy = ir.top - mr.top;
        props.onFootnote(text, {
          left: rect.left + dx,
          top: rect.top + dy,
          right: rect.right + dx,
          bottom: rect.bottom + dy,
        });
      },
      () => props.onFootnoteClose(),
      (url) => props.onExternalLink(url)
    );
    paginatorRef.current = p;
    return () => {
      p.dispose();
      paginatorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, server]);

  // 章节切换 → 加载
  const initialAnchorRef = useRef(props.initialAnchor ?? null);
  useEffect(() => {
    const p = paginatorRef.current;
    if (!p) return;
    autoAdvanceRef.current = false;
    const path = spineItemPath(book, spineIndex);
    if (!path) {
      props.onPageState({ status: "error", message: "章节资源缺失" });
      return;
    }
    void (async () => {
      // 目录/翻章是显式章节跳转：即使点的是当前章，也要回到开头或页内锚点，
      // 而不是沿用旧页号与旧阅读锚点。
      await p.load(path, { anchor: props.anchor, resetPage: true });
      // 打开书恢复阅读锚点：在 load 清空换章锚点之后、iframe 就绪之前设置
      if (initialAnchorRef.current) {
        p.setReadingAnchor({ path, ...initialAnchorRef.current });
        initialAnchorRef.current = null;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, spineIndex, props.anchorNonce]);

  // 设置变更 → 重载（阅读位置由分页器内容锚点保留；仅在实际变化时触发）
  const prevSettingsRef = useRef(effSettings);
  useEffect(() => {
    const p = paginatorRef.current;
    if (!p) return;
    if (prevSettingsRef.current === effSettings) return;
    prevSettingsRef.current = effSettings;
    void p.reloadWithSettings(effSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // 尺寸变化 → 重排（左右拉伸窗口等场景）。
  // 用 debounce：拉伸过程中 ResizeObserver 持续触发，只重置定时器、不做重排；
  // 停止 250ms 后才重排一次。浏览器窗口边框拖动没有 mouseup 事件，
  // 静默期就是"确认拉伸结束"的信号。
  // 关键：重排时不重新捕获锚点——此时用上一次稳定状态（翻页/上次重排）
  // 存下的锚点，保证正在读的内容在拉伸后仍回到页面中部。
  useEffect(() => {
    const el = iframeRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => paginatorRef.current?.reflow(), 250);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  // 翻页逻辑（滚轮与按钮/键盘共用）
  const turnPageRef = useRef<(dir: 1 | -1) => void>(() => {});
  turnPageRef.current = (dir) => {
    const p = paginatorRef.current;
    if (!p) return;
    // 章节未就绪期间忽略翻页：否则按键重复事件会按 pageCount=1 误判，
    // 连续请求上一章导致快速翻页时跳过多章
    if (lastStateRef.current !== "ready") return;
    if (dir === 1) {
      if (p.currentPage < p.pageCount - 1) {
        p.setPage(p.currentPage + 1);
      } else {
        const next = nextLinearIndex(book, spineIndexRef.current, 1);
        if (next >= 0) props.onRequestChapter(next);
      }
    } else {
      if (p.currentPage > 0) {
        p.setPage(p.currentPage - 1);
      } else {
        const prev = nextLinearIndex(book, spineIndexRef.current, -1);
        if (prev >= 0) props.onRequestChapter(prev, { atEnd: true });
      }
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      nextPage() {
        turnPageRef.current(1);
      },
      prevPage() {
        turnPageRef.current(-1);
      },
      setPage(i: number) {
        paginatorRef.current?.setPage(i);
      },
      diagnose() {
        return paginatorRef.current?.diagnose() ?? "（阅读器未初始化）";
      },
      getReadingAnchor() {
        return paginatorRef.current?.getReadingAnchor() ?? null;
      },
      getFootnoteMarkerRect() {
        const p = paginatorRef.current;
        const iframe = iframeRef.current;
        const main = iframe?.parentElement;
        const r = p?.getFootnoteMarkerRect();
        if (!p || !iframe || !main || !r) return null;
        const ir = iframe.getBoundingClientRect();
        const mr = main.getBoundingClientRect();
        const dx = ir.left - mr.left;
        const dy = ir.top - mr.top;
        return {
          left: r.left + dx,
          top: r.top + dy,
          right: r.right + dx,
          bottom: r.bottom + dy,
        };
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book]
  );

  // 固定版式：按 viewport 设置宽高比
  const vp = parseViewport(book.viewport);

  return (
    <div
      className="reader"
      style={
        book.fixedLayout && vp
          ? {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 12,
            }
          : undefined
      }
    >
      <iframe
        ref={iframeRef}
        title="chapter"
        style={
          book.fixedLayout && vp
            ? {
                position: "relative",
                inset: "auto",
                width: "auto",
                height: "auto",
                aspectRatio: `${vp.w} / ${vp.h}`,
                maxWidth: "100%",
                maxHeight: "100%",
              }
            : undefined
        }
      />
    </div>
  );
});
