/** 阅读器设置（渲染相关）。 */

export type Theme = "light" | "dark" | "sepia";

export interface ReaderSettings {
  fontSizePx: number;
  theme: Theme;
  /** 用户指定字体族；为空表示不覆盖书的字体 */
  fontFamily?: string;
  /** 分栏间距 px */
  gapPx: number;
  /** 行高倍率；undefined = 跟随书 */
  lineHeight?: number;
  /** 字重 400/500/700；undefined = 跟随书 */
  fontWeight?: number;
  /** 字间距 px；undefined = 跟随书 */
  letterSpacingPx?: number;
  /** 字符（词）间距 px；undefined = 跟随书 */
  wordSpacingPx?: number;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSizePx: 16,
  theme: "light",
  fontFamily: undefined,
  gapPx: 24,
};

/**
 * 行文版式（参考一般书籍/日轻文库本版心习惯）：
 * - maxEm：行宽上限（em，按正文字号计），默认 40em ≈ 一般书籍每行 40 字；
 *   宽屏/全屏时正文按此封顶居中
 * - vTopEm/vBottomEm：页面上下留白（em，上大下小，类实体书版心）
 */
/** 标准页：固定 1000 字/页（千字页口径），用于按内容字数推算阅读进度。 */
export const STANDARD_PAGE_CHARS = 1000;

export const TEXT_MEASURE = {
  maxEm: 40,
  vTopEm: 2.2,
  vBottomEm: 1.6,
};
