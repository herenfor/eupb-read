import { resolvePath, isExternalUrl } from "../core/paths";
import { TEXT_MEASURE } from "./settings";

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

export interface CssRewriteOptions {
  /** 读取书内 CSS 文本（递归处理 @import 链用） */
  getText?: (path: string) => string | undefined;
  /** 已内联的样式表路径（防循环 @import） */
  seen?: Set<string>;
}

/**
 * 重写 CSS 中的引用：
 * 1. @import "x.css" / @import url(x.css)：优先读取并递归内联（宽度换算与
 *    url() 相对路径都以被导入文件的位置为基准）；读不到时退回 blob @import
 * 2. 其余 url(...)（@font-face src、background 等）
 * 相对书内路径 → blob URL；外部/data:/blob:/# 保持原样。
 */
export function rewriteCssUrls(
  css: string,
  basePath: string,
  resolveUrl: (path: string) => string | undefined,
  options: CssRewriteOptions = {}
): string {
  // 先处理 @import（裸字符串与 url() 两种写法，保留媒体后缀）
  let out = css.replace(
    /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)|"([^"]*)"|'([^']*)')([^;]*);/gi,
    (match, dq, sq, bare, sdq, ssq, suffix) => {
      const raw = (dq ?? sq ?? bare ?? sdq ?? ssq ?? "").trim();
      if (!raw || /^(data:|blob:|https?:|mailto:|#|\/\/)/i.test(raw)) return match;
      const resolved = resolvePath(basePath, raw);
      // 能读到内容就递归内联：width:%→em、url()→blob 都以被导入文件为基准，
      // 也避免 blob 样式表里的相对路径失效
      const importedText = options.getText?.(resolved);
      if (importedText !== undefined) {
        const seen = new Set(options.seen ?? []);
        if (seen.has(resolved)) return `/* 循环 @import 已跳过：${raw} */`;
        seen.add(resolved);
        const rewritten = rewriteCssUrls(importedText, resolved, resolveUrl, {
          ...options,
          seen,
        });
        const note = `/* @import ${raw} → 内联 */`;
        const media = suffix?.trim();
        return media ? `${note}\n@media ${media} {\n${rewritten}\n}` : `${note}\n${rewritten}`;
      }
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
  // width:X% → 换算为 40em 版心宽度（与 sanitize 的 DOM 级重写配套）。
  // 书的 % 是按“页面≈版心”的阅读器写的，我们的页面=窗口全宽；
  // 跳过规则：全页图块（% 相对整页有意义）、img/svg/html/body 选择器。
  out = out.replace(/([^{}]*\{)([^{}]*\})/g, (block, head: string, body: string) => {
    if (
      /(illus|kuchie|cover|duokan-image-single|duokan-image-fullscreen|\bimg\b|\bsvg\b|\bhtml\b|\bbody\b)/i.test(
        head
      )
    ) {
      return block;
    }
    return (
      head +
      body.replace(
        /width\s*:\s*(\d+(?:\.\d+)?)\s*%/gi,
        (_w, x: string) => `width: ${(parseFloat(x) * TEXT_MEASURE.maxEm) / 100}em`
      )
    );
  });
  return out;
}
