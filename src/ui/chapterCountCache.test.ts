import { beforeEach, describe, expect, it } from "vitest";
import { applyChapterCount, createChapterCountCollection } from "./chapterCounts";
import { readCachedChapterCounts, writeChapterCountCache } from "./chapterCountCache";

describe("chapter count cache", () => {
  const memory = new Map<string, string>();
  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => { memory.set(key, value); },
        removeItem: (key: string) => { memory.delete(key); },
      },
    });
  });

  it("restores only matching structural estimates and never measured values", () => {
    let collection = createChapterCountCollection(1, [true, true, false]);
    collection = applyChapterCount(collection, 1, 0, 12, "estimated").collection;
    collection = applyChapterCount(collection, 1, 1, 20, "estimated").collection;
    writeChapterCountCache("hash", collection);
    expect(readCachedChapterCounts("hash", [true, true, false])).toEqual(new Map([[0, 12], [1, 20]]));
    expect(readCachedChapterCounts("hash", [true, false, true])).toEqual(new Map());
  });

  it("preserves older structural estimates when a chapter becomes measured", () => {
    let collection = createChapterCountCollection(1, [true, true]);
    collection = applyChapterCount(collection, 1, 0, 12, "estimated").collection;
    collection = applyChapterCount(collection, 1, 1, 20, "estimated").collection;
    writeChapterCountCache("hash", collection);
    collection = applyChapterCount(collection, 1, 0, 3, "measured").collection;
    writeChapterCountCache("hash", collection);
    expect(readCachedChapterCounts("hash", [true, true])).toEqual(new Map([[0, 12], [1, 20]]));
  });

  it("ignores malformed cache data", () => {
    localStorage.setItem("epub-reader-chapter-counts-v1", JSON.stringify({ version: 1, entries: { hash: { linear: [true], counts: [-1], touchedAt: 1 } } }));
    expect(readCachedChapterCounts("hash", [true])).toEqual(new Map());
  });
});
