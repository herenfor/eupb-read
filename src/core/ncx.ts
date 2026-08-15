import type { XmlNodeLike } from "./xml";
import { childElements, findElements, localNameOf } from "./xml";
import type { TocNode } from "./types";

function textOf(el: XmlNodeLike | undefined): string {
  return (el?.textContent ?? "").trim();
}

function parseNavPoint(navPoint: XmlNodeLike): TocNode {
  const label = findElements(navPoint, "text")[0];
  const content = findElements(navPoint, "content")[0];
  // 只递归直接子 navPoint（findElements 会包含自身，导致无限递归）
  const children = childElements(navPoint)
    .filter((np) => localNameOf(np) === "navPoint")
    .map(parseNavPoint);
  return {
    label: textOf(label),
    href: content?.getAttribute("src") ?? "",
    children,
  };
}

/**
 * 解析 EPUB 2 的 NCX 导航文件。
 * href 相对 NCX 文件位置，调用方需用 ncx 路径做基准解析。
 */
export function parseNcx(root: XmlNodeLike): TocNode[] {
  const navMap = findElements(root, "navMap")[0];
  if (!navMap) return [];
  return childElements(navMap)
    .filter((np) => localNameOf(np) === "navPoint")
    .map(parseNavPoint);
}
