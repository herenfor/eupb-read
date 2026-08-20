import { describe, expect, it } from "vitest";
import { currentChapterCharsRead } from "./readingProgress";

describe("current chapter progress numerator", () => {
  it("keeps a legacy-only restored page from being persisted as chapter start", () => {
    expect(
      currentChapterCharsRead({ textOffset: null, page: 4, pageCount: 10, chapterChars: 1_000 })
    ).toBe(500);
  });

  it("keeps exact text offset zero distinct from legacy page fallback", () => {
    expect(
      currentChapterCharsRead({ textOffset: 0, page: 4, pageCount: 10, chapterChars: 1_000 })
    ).toBe(0);
  });
});
