import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";

describe("reader settings", () => {
  it("默认关闭下一章预加载", () => {
    expect(DEFAULT_SETTINGS.preloadNextChapter).toBe(false);
  });
});
