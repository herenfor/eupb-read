/**
 * 脚注标记识别与目标提取。
 *
 * 兼容两类书的弹注约定：
 * 1. 多看/掌阅类：a.duokan-footnote / a[epub:type=noteref] / 内含 .zhangyue-footnote
 * 2. script.js（LK 阅读器参考脚本）的通用结构：
 *    <note> 容器内 <sup><a href="...#aside的id"> 标记 + 同容器内 <aside id="..."> 注释内容
 *
 * 阅读器禁用书内脚本，因此脚本里的 hover/touch 弹层、aside 隐藏都在阅读器侧原生实现：
 * 识别逻辑在本模块，隐藏由 sanitize 注入 CSS，弹层由 ChapterPaginator 触发。
 */

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? "";
}

/** 取 href 的锚点部分（"path#id" 与纯 "#id" 均可）；无锚点返回空串。 */
function hrefAnchor(href: string): string {
  const hash = href.lastIndexOf("#");
  if (hash < 0) return "";
  const raw = href.slice(hash + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 在 root 子树中找 id 匹配的第一个 <aside>（script.js 只把 aside 当注释内容）。 */
function findAsideById(root: ParentNode | null, id: string): HTMLElement | null {
  if (!root || !id) return null;
  for (const el of Array.from(root.querySelectorAll("aside"))) {
    if (attr(el, "id") === id) return el as HTMLElement;
  }
  return null;
}

function cleanText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** 该链接是否是脚注标记（弹注触发点）。 */
export function isFootnoteLink(a: HTMLAnchorElement): boolean {
  if (a.classList.contains("duokan-footnote")) return true;
  if (attr(a, "epub:type") === "noteref") return true;
  if (a.querySelector(".zhangyue-footnote, .duokan-footnote")) return true;
  // script.js 模式：仅当链接位于 <note> 的 <sup> 内且锚点命中同容器 <aside>
  const note = a.closest("note");
  if (!note || !a.closest("sup")) return false;
  const anchor = hrefAnchor(attr(a, "href"));
  return anchor !== "" && findAsideById(note, anchor) !== null;
}

export interface FootnoteInfo {
  text: string;
  /** 注释含图片等富内容时的 HTML（已消毒章内 DOM，图片 src 已是 blob URL） */
  html?: string;
  /** 注释内容元素（用于后续扩展） */
  target: HTMLElement;
}

/**
 * 提取脚注文本。优先取目标 <aside> 的文本（script.js 同款），
 * 缺失时回退到标记内图片的 zy-footnote 属性（部分掌阅书只写属性）。
 */
export function resolveFootnote(doc: Document, a: HTMLAnchorElement): FootnoteInfo | null {
  // 只处理脚注标记；普通链接（即使恰好指向同章 aside）走常规跳转
  if (!isFootnoteLink(a)) return null;
  const anchor = hrefAnchor(attr(a, "href").trim());
  if (!anchor) return null;
  // script.js 模式：优先在所在 <note> 内查找；多看模式：全文档按 id 找
  let target = findAsideById(a.closest("note"), anchor) ?? findAsideById(doc, anchor);
  if (!target) return null;
  const asideText = cleanText(target);
  if (asideText) {
    // 图片注释/带排版结构的注释：弹层需要渲染富内容而不是纯文本
    const html = target.querySelector("img") ? target.innerHTML : undefined;
    return { text: asideText, html, target };
  }
  const attrText = cleanText(a.querySelector("img") ?? a);
  const zyText = (a.querySelector("img")?.getAttribute("zy-footnote") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (zyText) return { text: zyText, target };
  // 兜底：注释内容为空时用标记元素自身文本（避免弹层空白）
  if (attrText) return { text: attrText, target };
  return null;
}
