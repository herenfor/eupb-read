import { resolvePath, isExternalUrl } from "../core/paths";

function resolveOrKeep(
  raw: string,
  basePath: string,
  resolveUrl: (path: string) => string | undefined,
  match: string
): string {
  const trimmed = raw.trim();
  if (!trimmed) return match;
  if (isExternalUrl(trimmed) || trimmed.startsWith("//") || trimmed.startsWith("#")) {
    return match;
  }
  const resolved = resolvePath(basePath, trimmed);
  const url = resolveUrl(resolved);
  if (!url) return match; // 资源缺失：保留原样，由浏览器静默失败
  return `url("${url}")`;
}

/**
 * 重写 CSS 中的引用：
 * 1. @import "x.css" / @import url(x.css)（保留媒体后缀）
 * 2. 其余 url(...)（@font-face src、background 等）
 * 相对书内路径 → blob URL；外部/data:/blob:/# 保持原样。
 */
export function rewriteCssUrls(
  css: string,
  basePath: string,
  resolveUrl: (path: string) => string | undefined
): string {
  // 先处理 @import（裸字符串与 url() 两种写法，保留媒体后缀）
  let out = css.replace(
    /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)|"([^"]*)"|'([^']*)')([^;]*);/gi,
    (match, dq, sq, bare, sdq, ssq, suffix) => {
      const raw = (dq ?? sq ?? bare ?? sdq ?? ssq ?? "").trim();
      if (!raw || /^(data:|blob:|https?:|mailto:|#|\/\/)/i.test(raw)) return match;
      const resolved = resolvePath(basePath, raw);
      const url = resolveUrl(resolved);
      if (!url) return match;
      return `@import url("${url}")${suffix ?? ""};`;
    }
  );
  // 再处理其余 url(...)
  out = out.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi,
    (match, dq: string | undefined, sq: string | undefined, bare: string | undefined) =>
      resolveOrKeep((dq ?? sq ?? bare ?? "").trim(), basePath, resolveUrl, match)
  );
  return out;
}
