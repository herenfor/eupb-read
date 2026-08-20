import type { XmlElementLike, XmlNodeLike } from "./xml";
import { childElements, findElements, isElement, localNameOf } from "./xml";
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

function isListElement(node: XmlNodeLike): boolean {
  const name = localNameOf(node).toLowerCase();
  return name === "ol" || name === "ul";
}

/**
 * 找当前容器下最近一层列表。遇到列表后不再向其内部搜索，遇到嵌套
 * li 也不穿透，这样父 li 不会把孙 li 的列表误认为自己的列表。
 */
function nearestChildLists(container: XmlNodeLike, stopAtLi = false): XmlElementLike[] {
  const found: Array<{ depth: number; element: XmlElementLike }> = [];
  const walk = (node: XmlNodeLike, depth: number): void => {
    for (const child of childElements(node)) {
      const name = localNameOf(child).toLowerCase();
      if (isListElement(child)) {
        found.push({ depth, element: child });
        continue;
      }
      // container 本身不会出现在 childElements(container) 中；因此遇到
      // 任意后代 li 都是嵌套项边界，不能用 isRoot 放行当前 li 的直接子项。
      if (stopAtLi && name === "li") continue;
      walk(child, depth + 1);
    }
  };
  walk(container, 0);
  if (found.length === 0) return [];
  const minDepth = Math.min(...found.map((entry) => entry.depth));
  return found.filter((entry) => entry.depth === minDepth).map((entry) => entry.element);
}

/** 读取 li 自身内容，跳过子列表和嵌套 li 的文字。 */
function ownText(node: XmlNodeLike): string {
  let text = "";
  const kids = node.childNodes;
  if (!kids) return firstText(node);
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    if (isElement(child)) {
      const name = localNameOf(child).toLowerCase();
      if (isListElement(child) || name === "li") continue;
      text += ownText(child);
    } else {
      text += child.textContent ?? "";
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

/** 找 li 自身的链接，搜索到子列表/嵌套 li 时停止。 */
function ownLinks(li: XmlNodeLike): XmlElementLike[] {
  const out: XmlElementLike[] = [];
  const walk = (node: XmlNodeLike): void => {
    for (const child of childElements(node)) {
      const name = localNameOf(child).toLowerCase();
      if (isListElement(child) || name === "li") continue;
      if (name === "a") {
        out.push(child);
        continue;
      }
      walk(child);
    }
  };
  walk(li);
  return out;
}

/** 解析单个 li：容忍 div 包裹，并保持多个最近子列表的文档顺序。 */
function parseLi(li: XmlNodeLike): TocNode {
  let label = "";
  let href = "";
  const as = ownLinks(li);
  for (const a of as) {
    const t = firstText(a);
    if (t) {
      label = t;
      href = a.getAttribute("href") ?? "";
      break;
    }
  }
  if (!label) label = ownText(li);
  const lists = nearestChildLists(li, true);
  const node: TocNode = {
    label,
    href,
    children: lists.flatMap((list) => parseList(list)),
  };
  if (!node.label && node.href) node.label = node.href;
  return node;
}

function parseList(listEl: XmlNodeLike): TocNode[] {
  const out: TocNode[] = [];
  for (const li of childElements(listEl)) {
    if (!li.tagName.toLowerCase().endsWith("li")) continue;
    const node = parseLi(li);
    // 即使父项没有自己的文字/链接，也保留它的子树，供 UI 以无效项
    // 置灰展示；不能因为父项缺少 href 就吞掉有效的深层目录。
    if (node.label || node.children.length > 0) out.push(node);
  }
  return out;
}

function epubTypeValue(nav: XmlElementLike): string {
  const namespaced = (nav as XmlElementLike & {
    getAttributeNS?: (namespace: string, localName: string) => string | null;
  }).getAttributeNS;
  const namespacedValue = namespaced?.call(nav, OPS_NS, "type");
  if (namespacedValue) return namespacedValue;
  const prefixed = nav.getAttribute("epub:type");
  if (prefixed) return prefixed;
  for (let i = 0; i < (nav.attributes?.length ?? 0); i++) {
    const attr = nav.attributes?.[i];
    if (!attr) continue;
    const name = attr.name.toLowerCase();
    if (name === "type" || name.endsWith(":type")) return attr.value;
  }
  return nav.getAttribute("type") ?? "";
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
      const types = epubTypeValue(nav).split(/\s+/);
      return types.includes("toc");
    }) ?? navs[0];
  if (!tocNav) return [];

  // 标准路径：最近一层 ol/ul
  const lists = nearestChildLists(tocNav);
  if (lists.length > 0) {
    const nodes = lists.flatMap((list) => parseList(list));
    if (nodes.length > 0) return nodes;
  }
  // 前端式兜底
  return parseAnchorsFlat(tocNav);
}

export { OPS_NS };
