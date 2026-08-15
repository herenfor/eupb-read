import type { XmlNodeLike } from "./xml";
import { childElements, findElements } from "./xml";
import type { TocNode } from "./types";

/** epub:type 命名空间（EPUB 3）。 */
const OPS_NS = "http://www.idpf.org/2007/ops";

/** 判定 href 能否用于书内跳转。 */
export function isUsableHref(href: string): boolean {
  const h = (href ?? "").trim();
  if (!h) return false;
  if (/^(javascript:|mailto:|tel:|data:|blob:)/i.test(h)) return false;
  if (/^(https?:|ftp:|\/\/)/i.test(h)) return false;
  if (h.startsWith("#")) return false; // 纯锚点：无目标文档，不可用于章节跳转
  return true;
}

function firstText(el: XmlNodeLike): string {
  return (el.textContent ?? "").trim();
}

/** 解析单个 li：在子树中找第一个有文字的 <a> 与嵌套列表（容忍 div 包裹）。 */
function parseLi(li: XmlNodeLike): TocNode {
  let label = "";
  let href = "";
  const as = findElements(li, "a");
  for (const a of as) {
    const t = firstText(a);
    if (t) {
      label = t;
      href = a.getAttribute("href") ?? "";
      break;
    }
  }
  if (!label) label = firstText(li);
  const lists = [...findElements(li, "ol"), ...findElements(li, "ul")];
  const childList = lists[0]; // findElements 按文档序，第一个即最浅层列表
  const node: TocNode = {
    label,
    href,
    children: childList ? parseList(childList) : [],
  };
  if (!node.label && node.href) node.label = node.href;
  return node;
}

function parseList(listEl: XmlNodeLike): TocNode[] {
  const out: TocNode[] = [];
  for (const li of childElements(listEl)) {
    if (!li.tagName.toLowerCase().endsWith("li")) continue;
    const node = parseLi(li);
    if (node.label) out.push(node);
  }
  return out;
}

/**
 * 前端式目录兜底：没有 ol/li 结构（relative 块包 absolute 块等 div 布局），
 * 按文档序提取所有 <a>，用祖先元素深度重建层级。
 */
function parseAnchorsFlat(container: XmlNodeLike): TocNode[] {
  const anchors = findElements(container, "a").filter((a) => firstText(a));
  if (anchors.length === 0) return [];
  // 目标元素在 container 子树中的元素深度
  const depthOf = (target: XmlNodeLike): number => {
    let depth = -1;
    const walk = (n: XmlNodeLike, d: number): void => {
      if (n === target) {
        depth = d;
        return;
      }
      const kids = n.childNodes;
      if (kids) {
        for (let i = 0; i < kids.length && depth < 0; i++) walk(kids[i], d + 1);
      }
    };
    walk(container, 0);
    return depth;
  };
  const root: TocNode = { label: "", href: "", children: [] };
  const stack: Array<{ depth: number; node: TocNode }> = [{ depth: -1, node: root }];
  for (const a of anchors) {
    const d = depthOf(a);
    const node: TocNode = {
      label: firstText(a),
      href: a.getAttribute("href") ?? "",
      children: [],
    };
    while (stack.length > 1 && stack[stack.length - 1].depth >= d) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ depth: d, node });
  }
  return root.children;
}

/**
 * 解析 EPUB 3 nav 文档中的目录（epub:type="toc"）。
 * 标准 ol/li 结构优先；无列表时走前端式兜底（div 布局按 a 提取）。
 * href 相对 nav 文档位置，调用方需做基准解析。
 */
export function parseNav(root: XmlNodeLike): TocNode[] {
  const navs = findElements(root, "nav");
  const tocNav =
    navs.find((nav) => {
      const types = (nav.getAttribute("epub:type") ?? "").split(/\s+/);
      return types.includes("toc");
    }) ?? navs[0];
  if (!tocNav) return [];

  // 标准路径：最近一层 ol/ul
  const list = childElements(tocNav).find((c) => {
    const t = c.tagName.toLowerCase();
    return t.endsWith("ol") || t.endsWith("ul");
  });
  if (list) {
    const nodes = parseList(list);
    if (nodes.length > 0) return nodes;
  }
  // 前端式兜底
  return parseAnchorsFlat(tocNav);
}

export { OPS_NS };
