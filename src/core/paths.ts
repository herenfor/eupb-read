/** EPUB 内部资源路径解析与规范化（与平台无关，纯逻辑）。 */

function safeDecode(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/**
 * 规范化内部路径：去空白段、处理 "." 与 ".."、解码百分号编码。
 * 结果用于资源查找的 key（大小写敏感，符合 EPUB 规范）。
 */
export function normalizePath(p: string): string {
  const decoded = safeDecode(p);
  const parts = decoded.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

/**
 * 以 base（某个文件的内部路径，如 "OEBPS/Text/ch1.xhtml"）为基准解析 href，
 * 返回规范化的内部路径。base 也可直接传目录（以 "/" 结尾，如 "OEBPS/"）。
 */
export function resolvePath(base: string, href: string): string {
  const decoded = safeDecode(href);
  if (decoded.startsWith("/")) return normalizePath(decoded);
  let baseDir: string;
  if (base.endsWith("/")) {
    baseDir = base.slice(0, -1);
  } else if (base.includes("/")) {
    baseDir = base.slice(0, base.lastIndexOf("/"));
  } else {
    baseDir = "";
  }
  return normalizePath(baseDir ? `${baseDir}/${decoded}` : decoded);
}

/** 是否为外部 URL（绝对 http(s)/mailto 等）或 data/blob 内联资源。 */
export function isExternalUrl(href: string): boolean {
  return /^(https?:|mailto:|tel:|data:|blob:|file:)/i.test(href);
}

/** 是否为纯页内锚点（#fragment）。 */
export function isFragmentOnly(href: string): boolean {
  return href.startsWith("#");
}

/** 拆分 "path#anchor" 形式的引用。 */
export function splitHref(href: string): { path: string; anchor: string } {
  const idx = href.indexOf("#");
  if (idx === -1) return { path: href, anchor: "" };
  return { path: href.slice(0, idx), anchor: href.slice(idx + 1) };
}

/** 从书名/标识生成稳定、可读的本地文件名（用于导出等）。 */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return cleaned || "book";
}
