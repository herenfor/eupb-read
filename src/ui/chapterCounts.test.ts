import { describe, expect, it } from "vitest";
import {
  applyChapterCount,
  computeProgressPct,
  createChapterCountCollection,
  resolveProgressPct,
  summarizeLinearCounts,
} from "./chapterCounts";

describe("chapter count collection", () => {
  it("enforces generation, source priority, and safe integer values", () => {
    const initial = createChapterCountCollection(7, [true, true, false]);
    const estimated = applyChapterCount(initial, 7, 0, 12, "estimated");
    expect(estimated.accepted).toBe(true);
    const measured = applyChapterCount(estimated.collection, 7, 0, 10, "measured");
    expect(measured.collection.counts[0]).toEqual({ value: 10, source: "measured" });
    const staleEstimate = applyChapterCount(measured.collection, 7, 0, 99, "estimated");
    expect(staleEstimate.accepted).toBe(false);
    expect(staleEstimate.collection.counts[0]).toEqual({ value: 10, source: "measured" });
    expect(applyChapterCount(initial, 8, 1, 1, "measured").accepted).toBe(false);
    expect(applyChapterCount(initial, 7, 1, -1, "estimated").accepted).toBe(false);
    expect(applyChapterCount(initial, 7, 1, Number.POSITIVE_INFINITY, "estimated").accepted).toBe(false);
  });

  it("summarizes only linear chapters and reports incomplete/approximate state", () => {
    const collection = createChapterCountCollection(1, [true, false, true]);
    const a = applyChapterCount(collection, 1, 0, 10, "measured").collection;
    const b = applyChapterCount(a, 1, 2, 20, "estimated").collection;
    expect(summarizeLinearCounts(b, 2)).toEqual({
      total: 30,
      before: 10,
      current: 20,
      complete: true,
      approximate: true,
    });
    const incomplete = createChapterCountCollection(2, [true, true]);
    expect(summarizeLinearCounts(incomplete, 1)).toEqual({
      total: 0,
      before: 0,
      current: null,
      complete: false,
      approximate: false,
    });
  });

  it("uses code-point progress and returns null until a complete nonempty denominator exists", () => {
    const collection = createChapterCountCollection(3, [true]);
    const measured = applyChapterCount(collection, 3, 0, 4, "measured").collection;
    const summary = summarizeLinearCounts(measured, 0);
    expect(computeProgressPct(summary, 2)).toBe(50);
    expect(computeProgressPct({ ...summary, complete: false }, 2)).toBeNull();
    expect(computeProgressPct({ ...summary, total: 0 }, 0)).toBeNull();
    expect(computeProgressPct(summary, 4)).toBe(100);
  });

  it("keeps a validated baseline only when exact progress is unavailable", () => {
    expect(resolveProgressPct(null, 37)).toBe(37);
    expect(resolveProgressPct(null, 0)).toBe(0);
    expect(resolveProgressPct(null, -4)).toBe(0);
    expect(resolveProgressPct(null, 140)).toBe(100);
    expect(resolveProgressPct(null, Number.NaN)).toBe(0);
    expect(resolveProgressPct(0, 37)).toBe(0);
    expect(resolveProgressPct(100, 0)).toBe(100);
  });
});
