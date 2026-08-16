import { describe, expect, it } from "vitest";
import {
  filterShelfEntries,
  formatShelfTime,
  shelfIdFor,
  sortShelfEntries,
  type ShelfEntry,
} from "./shelf";

function entry(over: Partial<ShelfEntry>): ShelfEntry {
  return {
    id: "id",
    title: "书",
    creator: "作者",
    fileName: "book.epub",
    fileSize: 100,
    coverMime: "",
    addedAtMs: 1,
    lastReadAtMs: 2,
    spineIndex: 0,
    page: 0,
    progressPct: 0,
    anchorIndex: null,
    anchorRatio: null,
    isNew: false,
    ...over,
  };
}

describe("shelfIdFor", () => {
  it("同标识/文件名/大小得到同一 id，任一字段变化则变化", () => {
    const a = shelfIdFor("urn:uuid:x", "book.epub", 123);
    expect(a).toBe(shelfIdFor("urn:uuid:x", "book.epub", 123));
    expect(a).not.toBe(shelfIdFor("urn:uuid:y", "book.epub", 123));
    expect(a).not.toBe(shelfIdFor("urn:uuid:x", "book2.epub", 123));
    expect(a).not.toBe(shelfIdFor("urn:uuid:x", "book.epub", 124));
  });

  it("只包含 16 进制字符（后端路径安全）", () => {
    expect(shelfIdFor("中文 书名:测试", "book (1).epub", 999)).toMatch(/^[0-9a-f]+$/);
  });
});

describe("sortShelfEntries", () => {
  const a = entry({ id: "a", title: "乙", addedAtMs: 1, lastReadAtMs: 3 });
  const b = entry({ id: "b", title: "甲", addedAtMs: 3, lastReadAtMs: 1 });
  const c = entry({ id: "c", title: "丙", addedAtMs: 2, lastReadAtMs: 2 });
  const all = [a, b, c];

  it("recent 按最近阅读排序", () => {
    expect(sortShelfEntries(all, "recent").map((e) => e.id)).toEqual(["a", "c", "b"]);
  });
  it("added 按最近添加排序", () => {
    expect(sortShelfEntries(all, "added").map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
  it("title 按书名排序（拼音序）且不改原数组", () => {
    const sorted = sortShelfEntries(all, "title");
    expect(sorted.map((e) => e.title)).toEqual(["丙", "甲", "乙"]);
    expect(all.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});

describe("filterShelfEntries", () => {
  const list = [
    entry({ id: "1", title: "命定之人是妻子的妹妹", creator: "逢緣奇演" }),
    entry({ id: "2", title: "诡屋", creator: "Ameku Takao" }),
  ];
  it("按书名匹配", () => {
    expect(filterShelfEntries(list, "诡").map((e) => e.id)).toEqual(["2"]);
  });
  it("按作者匹配（大小写不敏感）", () => {
    expect(filterShelfEntries(list, "ameku").map((e) => e.id)).toEqual(["2"]);
  });
  it("空查询返回全部", () => {
    expect(filterShelfEntries(list, "  ")).toHaveLength(2);
  });
});

describe("formatShelfTime", () => {
  it("无效值返回空串", () => {
    expect(formatShelfTime(0)).toBe("");
  });
});
