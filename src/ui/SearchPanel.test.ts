import { describe, expect, it } from "vitest";
import {
  SEARCH_RESULT_RENDER_LIMIT,
  getSearchStatusLabel,
  highlightSearchSnippet,
  limitSearchResults,
} from "./SearchPanel";

describe("search result presentation helpers", () => {
  it("splits original snippet text into highlighted and plain segments", () => {
    expect(highlightSearchSnippet("前文啄木鸟工匠后文", [{ start: 2, end: 7 }])).toEqual([
      { text: "前文", highlighted: false },
      { text: "啄木鸟工匠", highlighted: true },
      { text: "后文", highlighted: false },
    ]);
  });

  it("merges overlapping ranges and ignores invalid ranges", () => {
    expect(highlightSearchSnippet("abcdef", [
      { start: 4, end: 2 },
      { start: 1, end: 4 },
      { start: 3, end: 6 },
      { start: 99, end: 100 },
    ])).toEqual([
      { text: "a", highlighted: false },
      { text: "bcdef", highlighted: true },
    ]);
  });

  it("bounds the number of rendered results", () => {
    const results = Array.from({ length: SEARCH_RESULT_RENDER_LIMIT + 20 }, (_, id) => ({ id }));
    expect(limitSearchResults(results)).toEqual({
      items: results.slice(0, SEARCH_RESULT_RENDER_LIMIT),
      limited: true,
    });
  });

  it("describes search states without inventing progress for idle", () => {
    expect(getSearchStatusLabel("idle", 0, 4)).toBe("");
    expect(getSearchStatusLabel("searching", 2, 4)).toBe("正在搜索 2/4 章");
    expect(getSearchStatusLabel("complete", 4, 4)).toBe("搜索完成");
    expect(getSearchStatusLabel("error", 1, 4)).toBe("搜索失败");
  });
});
