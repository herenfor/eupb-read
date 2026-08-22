import { describe, expect, it } from "vitest";
import { computeFontVirtualWindow } from "./FontSettingsPanel";

describe("font virtual window", () => {
  it("keeps a 1000-row list scrollable to its final item", () => {
    const result = computeFontVirtualWindow(Array.from({ length: 1000 }, (_, i) => i), 999 * 36, 360, 36, 2);
    expect(result.totalHeight).toBe(36000);
    expect(result.items.at(-1)).toBe(999);
    expect(result.bottom).toBe(0);
    expect(result.end).toBe(1000);
  });

  it("clamps negative and excessive scroll positions", () => {
    const items = ["a", "b", "c"];
    expect(computeFontVirtualWindow(items, -100, 100, 36, 0).start).toBe(0);
    const result = computeFontVirtualWindow(items, 99999, 100, 36, 0);
    expect(result.start).toBe(3);
    expect(result.end).toBe(3);
    expect(result.items).toEqual([]);
  });
});
