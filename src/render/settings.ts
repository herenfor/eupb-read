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
 * 行文自适应版式（参考实体书/日轻文库本的行宽习惯）：
 * - ratio：行宽占页面宽的最大比例（宽屏时生效）
 * - maxEm：绝对舒适上限（em，按正文字号计），极端宽屏封顶
 * - minEm：行宽下限（em），窄页面时防止文字挤成细长竖条
 * - vTopEm/vBottomEm：页面上下留白（em，上大下小，类实体书版心）
 */
export const TEXT_MEASURE = {
  ratio: 0.7,
  maxEm: 38,
  minEm: 22,
  vTopEm: 2.2,
  vBottomEm: 1.6,
};
