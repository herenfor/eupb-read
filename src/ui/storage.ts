const PREFIX = "epub-reader:";

export interface SavedProgress {
  spineIndex: number;
  page: number;
  /** 内容锚点（精确恢复阅读位置；页码为兜底） */
  anchor?: { index: number; ratio: number } | null;
}

export function readProgress(key: string): SavedProgress | null {
  try {
    const raw = localStorage.getItem(PREFIX + "progress:" + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedProgress;
    if (typeof parsed.spineIndex !== "number" || typeof parsed.page !== "number") return null;
    if (
      parsed.anchor &&
      (typeof parsed.anchor.index !== "number" || typeof parsed.anchor.ratio !== "number")
    ) {
      parsed.anchor = null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeProgress(key: string, p: SavedProgress): void {
  try {
    localStorage.setItem(PREFIX + "progress:" + key, JSON.stringify(p));
  } catch {
    /* 存储不可用时静默失败 */
  }
}

export interface SavedSettings {
  fontSizePx?: number;
  theme?: "light" | "dark" | "sepia";
  /** UI 界面缩放（0.75–1.5），与正文字号相互独立 */
  uiScale?: number;
  lineHeight?: number;
  fontWeight?: number;
  letterSpacingPx?: number;
  wordSpacingPx?: number;
}

export function readSavedSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(PREFIX + "settings");
    return raw ? (JSON.parse(raw) as SavedSettings) : {};
  } catch {
    return {};
  }
}

export function writeSavedSettings(s: SavedSettings): void {
  try {
    localStorage.setItem(PREFIX + "settings", JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
