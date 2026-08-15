/** 与 XML DOM 解析无关的小工具：按 localName 取元素（容忍命名空间前缀差异）。 */

export interface XmlElementLike extends XmlNodeLike {
  tagName: string;
  getAttribute(name: string): string | null;
}

export interface XmlNodeLike {
  nodeType: number;
  localName?: string;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<XmlNodeLike>;
  attributes?: ArrayLike<{ name: string; value: string }>;
}

export const ELEMENT_NODE = 1;

export function localNameOf(node: XmlNodeLike): string {
  if (node.localName) return node.localName;
  const n = node.nodeName;
  const i = n.indexOf(":");
  return i === -1 ? n : n.slice(i + 1);
}

export function isElement(node: XmlNodeLike): node is XmlElementLike {
  return node.nodeType === ELEMENT_NODE;
}

export function childElements(node: XmlNodeLike): XmlElementLike[] {
  const out: XmlElementLike[] = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i];
    if (isElement(c)) out.push(c);
  }
  return out;
}

/** 在子树中查找 localName 匹配的所有元素（深度优先，按文档序）。 */
export function findElements(root: XmlNodeLike, localName: string): XmlElementLike[] {
  const out: XmlElementLike[] = [];
  const walk = (n: XmlNodeLike) => {
    if (isElement(n) && localNameOf(n) === localName) out.push(n);
    // xmldom 的文本节点 childNodes 为 null，需防御
    const kids = n.childNodes;
    if (kids) {
      for (let i = 0; i < kids.length; i++) walk(kids[i]);
    }
  };
  walk(root);
  return out;
}

/** 解析 META-INF/container.xml：返回第一个 rootfile 的 full-path。 */
export function parseContainerXml(xml: string): string {
  // container.xml 结构固定且极小，用 DOM 解析更稳。
  // 此处不依赖具体 DOM 实现，调用方传入已解析的 Document。
  const m = /<rootfile\b[^>]*\bfull-path\s*=\s*"([^"]+)"/i.exec(xml);
  if (m) return m[1];
  const m2 = /<rootfile\b[^>]*\bfull-path\s*=\s*'([^']+)'/i.exec(xml);
  if (m2) return m2[1];
  throw new Error("container.xml 中找不到 rootfile/full-path");
}
