import { describe, expect, it } from "vitest";
import { isCustomCssDraftDirty } from "./MenuPanel";

describe("custom CSS draft commit", () => {
  it("仅在草稿与已保存值不同才允许保存，并支持清空", () => {
    expect(isCustomCssDraftDirty("body { color: red; }", "body { color: red; }")).toBe(false);
    expect(isCustomCssDraftDirty("body { color: blue; }", "body { color: red; }")).toBe(true);
    expect(isCustomCssDraftDirty("", "body { color: red; }")).toBe(true);
    expect(isCustomCssDraftDirty("", "")).toBe(false);
  });
});
