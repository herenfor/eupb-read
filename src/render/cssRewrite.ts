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
  // width:X% → 改写为 min(X%, X%×40rem)（与 sanitize 的 DOM 级重写配套）。
  // 书的 % 是按“页面≈版心”的阅读器写的，我们的页面=窗口全宽；
  // min() 保留两个候选让浏览器按真实包含块取值：
  //   - 页面级元素：% 相对窗口（1311px 等），min 取版心比例值，维持 90%→576px 的语义；
  //   - 窄容器元素（td / authorbox / 浮动父容器）：% 相对窄包含块，
  //     min 取书自己的 %，不再被固定 em 拉宽溢出。
  // 仅改写 0 < X ≤ 100；X > 100 表示刻意超出包含块（出血），原样保留。
  // 跳过规则：全页图块（% 相对整页有意义）、img/svg/html/body 选择器，
  // 以及带组合器（后代/子代等）的嵌套选择器——它们的 % 相对某个限宽
  // 父容器（如 .authorbox table{width:100%}），改写会破坏书布局。
  const hasCombinator = (selector: string): boolean => {
    // 注释不是选择器的一部分，先剥离再判断（内联 @import 会留下注释）
    const s = selector.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
    if (!s || s.startsWith("@")) return false; // @media 等 at-rule 交给内层规则
    return s
      .split(",")
      .some((part) => /[\s>+~]/.test(part.trim()));
  };
  // 纯标签选择器（如 note{width:100%}、table{width:100%}）的 % 相对父容器，
  // 不是页面版心比例，不能换算成固定 em——否则 note 被拉到 40em，
  // 内部浮动元素可用宽度计算异常（聊天气泡逐字换行）。
  const isBareTypeSelector = (selector: string): boolean => {
    const s = selector.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
    if (!s || s.startsWith("@")) return false;
    return !/[.#]/.test(s);
  };
  out = out.replace(/([^{}]*\{)([^{}]*\})/g, (block, head: string, body: string) => {
    const selector = head.replace(/\s*\{$/, "");
    if (
      /(illus|kuchie|cover|duokan-image-single|duokan-image-fullscreen|\bimg\b|\bsvg\b|\bhtml\b|\bbody\b)/i.test(
        selector
      ) ||
      hasCombinator(selector) ||
      isBareTypeSelector(selector) ||
      // 浮动元素的 width:% 相对其包含块（如目录页 .ctt{width:100%;float:left}
      // 相对 21em 的 tocbox），不能按页面版心换算成固定 em。
      /(?:^|;)\s*float\s*:/i.test(body)
    ) {
      return block;
    }
    return (
      head +
      body.replace(
        /(^|[;{])(\s*)width\s*:\s*(\d+(?:\.\d+)?)\s*%/gi,
        (_w, pre: string, sp: string, x: string) => {
          const pct = parseFloat(x);
          if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return _w;
          return `${pre}${sp}width: min(${x}%, ${(pct * TEXT_MEASURE.maxEm) / 100}rem)`;
        }
      )
    );
  });
  return out;
}
