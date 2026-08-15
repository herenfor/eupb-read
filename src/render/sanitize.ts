import { parseXmlText, hasParserError, getSerializer } from "../core/parseXml";
import { resolvePath, isExternalUrl, isFragmentOnly } from "../core/paths";
import { findElements, type XmlElementLike } from "../core/xml";
import { rewriteCssUrls } from "./cssRewrite";
import { TEXT_MEASURE, type ReaderSettings } from "./settings";

export interface SanitizeOptions {
  /** 章节文件的内部路径，用于解析相对引用 */
  basePath: string;
  /** EPUB 2 用严格 XML 解析；EPUB 3 用宽松 HTML 解析 */
  strictXml: boolean;
  /** 内部路径 → blob URL */
  urlFor: (path: string) => string | undefined;
  /** 读取内部资源文本（样式表内容改写用） */
  getText?: (path: string) => string | undefined;
  /** 由改写后的内容生成 URL（浏览器传 blob，测试传假实现） */
  makeUrl?: (text: string, mediaType: string) => string;
  settings: ReaderSettings;
}

export interface SanitizeResult {
  html: string;
  issues: string[];
  /** 是否发生了解析降级（XML 失败转 HTML） */
  downgraded: boolean;
}

const STRIP_TAGS = new Set([
  "script",
  "object",
  "embed",
  "iframe",
  "frame",
  "frameset",
  "base",
  "form",
  "input",
  "button",
  "select",
  "textarea",
]);

export const VIEWER_ID = "epub-viewer";

/** 仅接受 #hex 或安全色名，防止书里的 bgcolor 注入任意 CSS */
function isSafeColor(v: string): boolean {
  if (/^#[0-9a-fA-F]{3,8}$/.test(v.trim())) return true;
  const SAFE_NAMES = new Set([
    "white", "black", "ivory", "beige", "linen", "seashell", "floralwhite",
    "oldlace", "snow", "mistyrose", "lavender", "lavenderblush", "honeydew",
    "mintcream", "azure", "aliceblue", "lightyellow", "lightgoldenrodyellow",
    "papayawhip", "antiquewhite", "bisque", "wheat", "cornsilk",
    "lightgray", "lightgrey", "gainsboro", "silver", "gray", "grey",
    "whitesmoke", "lightblue", "lightcyan", "lightpink", "lightgreen",
  ]);
  return SAFE_NAMES.has(v.trim().toLowerCase());
}

function buildOverrideCss(s: ReaderSettings): string {
  const bg =
    s.theme === "dark" ? "#1e1e1e" : s.theme === "sepia" ? "#f4ecd8" : "#ffffff";
  const fg = s.theme === "dark" ? "#d4d4d4" : s.theme === "sepia" ? "#3b2f1e" : "#1a1a1a";
  const family =
    s.fontFamily ??
    `"Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif`;
  const maxEm = TEXT_MEASURE.maxEm;
  const footnoteCss = `
/* 脚注标记小图标：按书的设计随字号缩放，不被通用图片规则放大 */
#${VIEWER_ID} sup img,
#${VIEWER_ID} .duokan-footnote img,
#${VIEWER_ID} .zhangyue-footnote img {
  height: 1.2em !important;
  width: auto !important;
  max-width: none !important;
  max-height: none !important;
  vertical-align: top;
  border: 0;
}
/* 脚注内容（aside）：从正文流隐藏，由阅读器弹层显示。
   第二段兼容 script.js（LK 参考脚本）的书：<note> 内 aside 即弹注内容，
   即使书没标 epub:type 也要隐藏，否则正文会多出一块注释块。 */
#${VIEWER_ID} aside[epub\\:type="footnote"],
#${VIEWER_ID} note aside { display: none !important; }`;
  // 排版属性（未设置 = 跟随书的定义）
  const typeCss = [
    s.lineHeight !== undefined ? `line-height: ${s.lineHeight} !important;` : "",
    s.fontWeight !== undefined ? `font-weight: ${s.fontWeight} !important;` : "",
    s.letterSpacingPx !== undefined
      ? `letter-spacing: ${s.letterSpacingPx}px !important;`
      : "",
    s.wordSpacingPx !== undefined ? `word-spacing: ${s.wordSpacingPx}px !important;` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `
html, body { position: relative; height: 100%; margin: 0 !important; padding: 0 !important; }
/* 行文自适应：容器全宽；正文版心由块级元素限宽居中（rem 随正文字号缩放）。
   max-width 必须用 rem 而不是 em：em 相对元素自身 font-size，
   书中 0.75em/1.05em 这类不同字号的元素会得到不同版心宽度并错位。
   特异性分层：:where(#viewer) :not(img) = (0,0,1)
   - 高于/等于书的通用元素规则（如 div{margin:0}），且注入在最后 → 默认居中生效
   - 低于书的类规则（如 .toc{margin...}、.paper{max-width:30em}）→ 书布局声明优先 */
#${VIEWER_ID} { height: 100%; overflow: hidden; margin: 0 auto; box-sizing: border-box; }
:where(#${VIEWER_ID}) :not(img) {
  max-width: ${maxEm}rem;
  margin-left: auto;
  margin-right: auto;
  ${typeCss}
}
/* 页面级元素强制版心居中：标题、正文段、分隔符（.cut）等都是 viewer 的
   直接子，即使书用类写了 margin:0 也必须水平居中（text-align:center 的
   盒子若贴左，文字整体就偏左）。直接子在 sanitize 阶段被打上 reader-top
   标记；嵌套元素（目录条目等）没有标记，书布局生效。
   （不能用 ">" 子选择器：序列化会转义成 &gt;，RAWTEXT 不解码导致失效。） */
:where(#${VIEWER_ID}) .reader-top {
  margin-left: auto !important;
  margin-right: auto !important;
}
${footnoteCss}
/* 正文普通图片：只限制溢出，不覆盖书定义的高度（如 .cut img{height:2em}）。
   object-fit:contain 保证被列宽压缩时按比例缩放不拉伸变形。 */
#${VIEWER_ID} img { max-width: 100% !important; object-fit: contain; }
#${VIEWER_ID} img, #${VIEWER_ID} video, #${VIEWER_ID} svg { max-height: 100% !important; }
/* 全页图片块：豁免版心限制，占满一整页（正文中的插图页） */
#${VIEWER_ID} .illus, #${VIEWER_ID} .kuchie, #${VIEWER_ID} .cover,
#${VIEWER_ID} .duokan-image-single, #${VIEWER_ID} .duokan-image-fullscreen {
  max-width: none !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
}
#${VIEWER_ID} .illus img, #${VIEWER_ID} .kuchie img, #${VIEWER_ID} .cover img,
#${VIEWER_ID} .duokan-image-single img, #${VIEWER_ID} .duokan-image-fullscreen img {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  border: none !important;
  object-fit: contain;
}
html { font-size: ${s.fontSizePx}px !important; }
/* 主题只覆盖背景色，不能写 background 简写：简写会把书在 body 上
   声明的 background-image（如目录页背景图）重置为 none。 */
body { color: ${fg}; background-color: ${bg}; font-family: ${family}; }
`;
}

/**
 * 消毒并改写章节 HTML：
 * 1. 按版本选择 XML/HTML 解析（XML 失败自动降级 HTML）
 * 2. 移除脚本与危险标签/属性
 * 3. 把内部资源引用改写为 blob URL（含 CSS url() 与内联 style）
 * 4. 注入 CSP 与阅读器覆盖 CSS（字号/主题/字体回退链/图片约束）
 */
export async function sanitizeChapter(
  htmlText: string,
  opts: SanitizeOptions
): Promise<SanitizeResult> {
  // 关键修复：XHTML 风格的自闭合 <script src="..."/> 在 HTML5 解析器里
  // 会被忽略自闭合标志（script 不在自闭合清单），导致 script 元素吞掉
  // 后续全部内容直到 EOF 上不存在的 </script>——内容全部丢失。
  // 先补成正常闭合，再由消毒循环按常规 script 删除。
  htmlText = htmlText.replace(/<script\b([^>]*?)\/\s*>/gi, "<script$1></script>");

  const issues: string[] = [];
  let doc: Document;
  let downgraded = false;
  if (opts.strictXml) {
    doc = await parseXmlText(htmlText, "application/xml");
    if (hasParserError(doc)) {
      downgraded = true;
      issues.push("XHTML 严格解析失败，已降级为宽松 HTML 解析");
      doc = await parseXmlText(htmlText, "text/html");
    }
  } else {
    doc = await parseXmlText(htmlText, "text/html");
  }

  const root = doc.documentElement;
  if (!root) {
    throw new Error("章节内容为空，无法渲染");
  }

  // 1) 移除危险标签
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (STRIP_TAGS.has(el.tagName.toLowerCase())) {
      el.parentNode?.removeChild(el);
      continue;
    }
    // meta refresh 防自动跳转
    if (el.tagName.toLowerCase() === "meta") {
      const he = (el.getAttribute("http-equiv") ?? "").toLowerCase();
      if (he === "refresh") {
        el.parentNode?.removeChild(el);
        continue;
      }
    }

    // 2) 清理属性
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "src" || name === "poster" || name === "data" || name === "xlink:href") {
        const value = attr.value.trim();
        if (!value) continue;
        if (/^\s*javascript:/i.test(value)) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (isFragmentOnly(value) || isExternalUrl(value) || value.startsWith("//")) {
          continue;
        }
        const url = opts.urlFor(resolvePath(opts.basePath, value));
        if (url) {
          el.setAttribute(attr.name, url);
        } else {
          el.removeAttribute(attr.name);
          issues.push(`资源缺失，已移除引用：${value}`);
        }
      } else if (name === "href" && el.tagName.toLowerCase() === "a") {
        const value = attr.value.trim();
        if (/^\s*javascript:/i.test(value)) el.removeAttribute(attr.name);
      }
    }

    // 3) 内联 style 中的 url()
    const style = el.getAttribute("style");
    if (style) {
      el.setAttribute("style", rewriteCssUrls(style, opts.basePath, opts.urlFor));
    }
  }

  // 4) 样式表：内容改写（@import/url() → blob）+ href 指向新 blob；缺失则移除
  for (const link of Array.from(doc.getElementsByTagName("link"))) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase();
    if (rel.includes("stylesheet")) {
      const href = link.getAttribute("href");
      if (href && !isExternalUrl(href)) {
        const cssPath = resolvePath(opts.basePath, href);
        // 优先：读取 CSS 内容并改写其内部引用（@font-face/background/@import 相对路径）
        const cssText = opts.getText?.(cssPath);
        if (cssText !== undefined && opts.makeUrl) {
          const rewritten = rewriteCssUrls(cssText, cssPath, opts.urlFor, {
            getText: opts.getText,
          });
          link.setAttribute("href", opts.makeUrl(rewritten, "text/css"));
        } else {
          const url = opts.urlFor(cssPath);
          if (url) {
            link.setAttribute("href", url);
          } else {
            link.parentNode?.removeChild(link);
            issues.push(`样式表缺失，已移除：${href}`);
          }
        }
      }
    } else {
      link.parentNode?.removeChild(link);
    }
  }

  // 4.5) 页内 <style> 块：与样式表同规则改写（url() 引用 + width:% 版心换算）
  for (const stEl of Array.from(doc.getElementsByTagName("style"))) {
    const text = stEl.textContent;
    if (text) {
      const rewritten = rewriteCssUrls(text, opts.basePath, opts.urlFor);
      while (stEl.firstChild) stEl.removeChild(stEl.firstChild);
      stEl.appendChild(doc.createTextNode(rewritten));
    }
  }

  // 5) 把正文包进分页容器（paginator 依赖 #epub-viewer 做多栏分页）
  const bodyEl = doc.getElementsByTagName("body")[0] ?? root;
  const viewer = doc.createElement("div");
  // 注意用 setAttribute：xmldom 不实现 el.id 属性反射，浏览器两端通用
  viewer.setAttribute("id", VIEWER_ID);
  while (bodyEl.firstChild) {
    viewer.appendChild(bodyEl.firstChild);
  }
  bodyEl.appendChild(viewer);
  // 标记 viewer 的直接子元素：页面级内容（标题/正文段/分隔符）需要强制
  // 版心居中；嵌套元素不打标记，保留书的布局（如目录条目交错 margin）。
  // 注意用 childNodes：xmldom 不实现 element.children。
  for (let c = viewer.firstChild; c; c = c.nextSibling) {
    if (c.nodeType !== 1) continue;
    const child = c as Element;
    const cls = child.getAttribute("class");
    child.setAttribute("class", cls ? `${cls} reader-top` : "reader-top");
  }

  // 5.4) 宽度百分比重写：书里的 width:X% 是按“页面≈版心”的阅读器写的，
  // 我们的页面=窗口全宽、版心=maxEm，若 % 相对整页，90% 的盒子会几乎占满整页。
  // 换算为版心宽度（em），盒子与正文行宽比例一致。
  // 跳过：img/svg（自有缩放规则）、全页图块内部（% 相对整页有意义）、
  // 已显式定宽祖先内部（% 应相对该祖先，保持原样）。
  const FULLPAGE_CLASS_RE =
    /(^|\s)(illus|kuchie|cover|duokan-image-single|duokan-image-fullscreen)(\s|$)/;
  const hasFullpageClass = (el: Element): boolean =>
    FULLPAGE_CLASS_RE.test(el.getAttribute("class") ?? "");
  const insideFullpage = (el: Element): boolean => {
    for (let n = el.parentNode; n && n !== viewer; n = n.parentNode) {
      if (n.nodeType === 1 && hasFullpageClass(n as Element)) return true;
    }
    return false;
  };
  const ancestorHasWidth = (el: Element): boolean => {
    for (let n = el.parentNode; n && n !== viewer; n = n.parentNode) {
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      if (/width\s*:/.test(e.getAttribute("style") ?? "")) return true;
      if (e.getAttribute("width")) return true;
    }
    return false;
  };
  const pctToEm = (x: string): string =>
    `${(parseFloat(x) * TEXT_MEASURE.maxEm) / 100}em`;
  // 注意：findElements 按 localName 精确匹配，无法传 "*"，这里手动递归收集子树元素
  const allEls: Element[] = [];
  const collect = (n: Node): void => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1) {
        allEls.push(c as Element);
        collect(c);
      }
    }
  };
  collect(viewer);
  for (const el of allEls) {
    const tag = el.tagName.toLowerCase();
    if (tag === "img" || tag === "svg") continue;
    if (insideFullpage(el) || ancestorHasWidth(el)) continue;
    const st = el.getAttribute("style");
    if (st && /width\s*:\s*(\d+(?:\.\d+)?)\s*%/i.test(st)) {
      el.setAttribute(
        "style",
        st.replace(/width\s*:\s*(\d+(?:\.\d+)?)\s*%/gi, (_m, x: string) => `width: ${pctToEm(x)}`)
      );
    }
    const wAttr = el.getAttribute("width");
    if (wAttr && /^\s*\d+(?:\.\d+)?\s*%\s*$/.test(wAttr)) {
      const merged = `${el.getAttribute("style") ?? ""} width: ${pctToEm(wAttr)};`.trim();
      el.setAttribute("style", merged);
    }
  }

  // 5.5) 纯图片页（封面/插图）：标记并注入整屏填充样式
  // （覆盖书里 90vh 等高度限制，object-fit:contain 保证不超出屏幕地尽量填满）
  // 仅单图且图片没有自带尺寸约束（inline width/height 等）的页面整页填充；
  // 多图页、限宽 title 图按书自身排版，否则会把一页拆成两页 / 把限宽图放大到全屏。
  const bodyText = (bodyEl.textContent ?? "").trim();
  const images = findElements(viewer, "img");
  const hasOwnSize = (el: XmlElementLike): boolean => {
    const st = el.getAttribute("style") ?? "";
    if (/\b(?:width|height|max-width|max-height|min-width|min-height)\s*:/.test(st)) {
      return true;
    }
    // xmldom 对不存在的属性返回 ""（不是 null），要按空值判断
    return Boolean(el.getAttribute("width")) || Boolean(el.getAttribute("height"));
  };
  if (images.length === 1 && bodyText.length === 0 && !hasOwnSize(images[0])) {
    viewer.setAttribute("class", "fullpage-image");
    const imgStyle = doc.createElement("style");
    imgStyle.setAttribute("data-reader", "fullpage-image");
    // 注意：不能使用 ">" 子选择器——序列化会转义成 &gt;，而 HTML 解析器
    // 不解码 <style> 内的字符引用，会导致规则失效。用后代选择器代替。
    imgStyle.textContent = `
#${VIEWER_ID}.fullpage-image :not(img) { height: 100% !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
#${VIEWER_ID}.fullpage-image img {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  border: none !important;
  object-fit: contain;
}`;
    const headForImg = doc.head ?? doc.documentElement;
    headForImg.appendChild(imgStyle);
  }

  // 6) 注入 CSP 与阅读器覆盖样式（放在所有书样式之后，保证覆盖优先级）
  const head = doc.head ?? doc.documentElement;
  const csp = doc.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute(
    "content",
    "default-src 'none'; style-src 'unsafe-inline' blob:; img-src blob: data: https: http:; font-src blob: data:; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
  );
  head.appendChild(csp);

  const styleEl = doc.createElement("style");
  styleEl.setAttribute("data-reader", "overrides");
  styleEl.textContent = buildOverrideCss(opts.settings);
  head.appendChild(styleEl);

  // 参考脚本优化：书声明了 body bgcolor 时，浅色主题下让版面底色跟随书的设定
  // （只接受安全颜色写法，防止 CSS 注入）
  const bgcolor = bodyEl.getAttribute("bgcolor");
  if (bgcolor && opts.settings.theme === "light" && isSafeColor(bgcolor)) {
    const bgStyle = doc.createElement("style");
    bgStyle.setAttribute("data-reader", "bgcolor");
    // 同样只用 background-color：body 上的背景图（目录页等）应继续显示
    bgStyle.textContent = `body { background-color: ${bgcolor} !important; }`;
    head.appendChild(bgStyle);
  }

  const html = (await getSerializer()).serializeToString(doc);
  return { html, issues, downgraded };
}
