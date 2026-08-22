import { describe, expect, it } from "vitest";
import {
  exportLibraryArchive,
  mergeLibraryArchives,
  parseDeviceBinding,
  parseLibraryArchive,
  type LibraryArchive,
} from "./libraryArchive";

const hash = "a".repeat(64);
const note = (overrides: Record<string, unknown> = {}) => ({
  id: "note-1",
  spineIndex: 1,
  chapterPath: "Text/chapter.xhtml",
  startTextOffset: 10,
  endTextOffset: 14,
  startTextSnippet: "开始文字",
  endTextSnippet: "结束文字",
  selectedText: "开始 文字",
  content: "值得回看",
  createdAtMs: 100,
  updatedAtMs: 100,
  ...overrides,
});
const record = (overrides: Record<string, unknown> = {}) => ({
  title: "A/B: title",
  creator: "Author",
  fileName: "book.epub",
  addedAtMs: 10,
  lastReadAtMs: 20,
  spineIndex: 1,
  page: 2,
  progressPct: 30,
  anchorIndex: 4,
  anchorRatio: 0.5,
  anchorTextOffset: 12,
  anchorTextSnippet: "正文",
  isNew: false,
  bookmarks: [],
  ...overrides,
});

describe("portable library archive", () => {
  it("normalizes valid records, ignores unknown fields, and reports bad records individually", () => {
    const result = parseLibraryArchive({
      version: 1,
      records: {
        [hash]: { ...record(), sourcePath: "/home/user/book.epub", extra: "ignored" },
        bad: record(),
      },
      settings: { fontSizePx: 18, customFonts: [{ family: "x", url: "file:///tmp/x" }] },
    });
    expect(Object.keys(result.archive.records)).toEqual([hash]);
    expect(result.archive.records[hash].title).toBe("A/B: title");
    expect(result.archive.settings).toEqual({ fontSizePx: 18 });
    expect(result.errors.some((item) => item.path === `records.${hash}.sourcePath`)).toBe(true);
    expect(result.errors.some((item) => item.path === "records.bad")).toBe(true);
  });

  it("rejects path-bearing filename values but allows slashes in book names", () => {
    const result = parseLibraryArchive({
      version: 1,
      records: {
        [hash]: record({ fileName: "C:\\Users\\me\\book.epub" }),
      },
    });
    expect(result.archive.records).toEqual({});
    expect(result.errors[0].code).toBe("path-leak");
  });

  it("defaults omitted old text-anchor fields and rejects unsafe new ones without changing v1", () => {
    const { anchorTextOffset: _offset, anchorTextSnippet: _snippet, ...legacy } = record();
    const old = parseLibraryArchive({ version: 1, records: { [hash]: legacy } });
    expect(old.errors).toHaveLength(0);
    expect(old.archive.records[hash].anchorTextOffset).toBeNull();
    expect(old.archive.records[hash].anchorTextSnippet).toBeNull();
    const invalid = parseLibraryArchive({
      version: 1,
      records: { [hash]: record({ anchorTextOffset: 3, anchorTextSnippet: "has space" }) },
    });
    expect(invalid.archive.records).toEqual({});
    expect(invalid.errors.some((item) => item.code === "invalid-anchor-text")).toBe(true);
  });

  it("merges by hash, preserves the earliest added time, and rejects older progress", () => {
    const base: LibraryArchive = { version: 1, records: { [hash]: { contentHash: hash, ...record({ addedAtMs: 2, lastReadAtMs: 30, page: 9, bookmarks: [{ id: "b", spineIndex: 0, page: 1, anchorIndex: null, anchorRatio: null, anchorTextOffset: null, anchorTextSnippet: null, text: "old", createdAtMs: 2 }] }) } } };
    const incoming: LibraryArchive = { version: 1, records: { [hash]: { contentHash: hash, ...record({ addedAtMs: 5, lastReadAtMs: 10, page: 1, bookmarks: [{ id: "b", spineIndex: 0, page: 2, anchorIndex: null, anchorRatio: null, anchorTextOffset: null, anchorTextSnippet: null, text: "new", createdAtMs: 3 }, { id: "c", spineIndex: 1, page: 2, anchorIndex: null, anchorRatio: null, anchorTextOffset: null, anchorTextSnippet: null, text: "c", createdAtMs: 1 }] }) } } };
    const merged = mergeLibraryArchives(base, incoming);
    expect(merged.records[hash].addedAtMs).toBe(2);
    expect(merged.records[hash].page).toBe(9);
    expect(merged.records[hash].bookmarks.find((item) => item.id === "b")?.page).toBe(2);
    expect(merged.records[hash].bookmarks).toHaveLength(2);
    expect(() => exportLibraryArchive(merged)).not.toThrow();
  });

  it("prefers actual reading evidence over a newer import-only timestamp", () => {
    const read = { ...record({ addedAtMs: 10, lastReadAtMs: 20, spineIndex: 0, page: 3, progressPct: 0, anchorIndex: null, anchorRatio: null, anchorTextOffset: null, anchorTextSnippet: null, isNew: true }) };
    const imported = { ...record({ addedAtMs: 30, lastReadAtMs: 0, spineIndex: 0, page: 0, progressPct: 0, anchorIndex: null, anchorRatio: null, anchorTextOffset: null, anchorTextSnippet: null, isNew: true }) };
    const merged = mergeLibraryArchives(
      { version: 1, records: { [hash]: { contentHash: hash, ...read } } },
      { version: 1, records: { [hash]: { contentHash: hash, ...imported } } },
    );
    expect(merged.records[hash].page).toBe(3);
  });

  it("does not treat the legacy isNew import timestamp as reading evidence", () => {
    const legacy = { ...record({ addedAtMs: 20, lastReadAtMs: 20, spineIndex: 0, page: 0, progressPct: 0, anchorIndex: null, anchorRatio: null, anchorTextOffset: null, anchorTextSnippet: null, isNew: true }) };
    const read = { ...record({ addedAtMs: 10, lastReadAtMs: 11, spineIndex: 0, page: 2, progressPct: 0, anchorIndex: null, anchorRatio: null, anchorTextOffset: null, anchorTextSnippet: null, isNew: true }) };
    const merged = mergeLibraryArchives(
      { version: 1, records: { [hash]: { contentHash: hash, ...legacy } } },
      { version: 1, records: { [hash]: { contentHash: hash, ...read } } },
    );
    expect(merged.records[hash].page).toBe(2);
  });

  it("validates device bindings separately", () => {
    const result = parseDeviceBinding({ contentHash: hash, sourcePath: "/books/a.epub", fileSize: 3, mtime: 4, lastVerifiedAt: 5 });
    expect(result.errors).toHaveLength(0);
    expect(result.binding?.sourcePath).toBe("/books/a.epub");
  });

  it("rejects absolute local resources in custom CSS but permits relative and HTTPS URLs", () => {
    const base = { version: 1, records: {} };
    for (const customCss of [
      'body { background: url("file:///C:/Users/me/cover.png"); }',
      "body { background: url(C:\\Users\\me\\cover.png); }",
      "body { background: url(/home/me/cover.png); }",
      "body { background: url(\\\\server\\share\\cover.png); }",
    ]) {
      const result = parseLibraryArchive({ ...base, settings: { customCss } });
      expect(result.errors.some((item) => item.code === "path-leak")).toBe(true);
      expect(result.archive.settings?.customCss).toBeUndefined();
      expect(() => exportLibraryArchive({ ...base, settings: { customCss } } as LibraryArchive)).toThrow();
    }
    for (const customCss of [
      ".cover { background: url(../Images/cover.png); }",
      ".cover { background: url(https://example.com/cover.png); }",
      ".cover { background: url(data:image/png;base64,abc); }",
    ]) {
      const result = parseLibraryArchive({ ...base, settings: { customCss } });
      expect(result.errors).toHaveLength(0);
      expect(result.archive.settings?.customCss).toBe(customCss);
    }
  });

  it("does not treat a normal font family as a resource URL", () => {
    const result = parseLibraryArchive({ version: 1, records: {}, settings: { customFontName: "Noto Sans CJK" } });
    expect(result.errors).toHaveLength(0);
    expect(result.archive.settings?.customFontName).toBe("Noto Sans CJK");
  });

  it("normalizes old notes to [] and merges note ids by updated time", () => {
    const old = parseLibraryArchive({ version: 1, records: { [hash]: record() } });
    expect(old.errors).toHaveLength(0);
    expect(old.archive.records[hash].notes).toEqual([]);
    const first = { version: 1 as const, records: { [hash]: { contentHash: hash, ...record({ notes: [note()] }) } } };
    const second = { version: 1 as const, records: { [hash]: { contentHash: hash, ...record({ notes: [note({ content: "new", updatedAtMs: 101 }), note({ id: "note-2" })] }) } } };
    const merged = mergeLibraryArchives(first, second);
    expect(merged.records[hash].notes?.find((item) => item.id === "note-1")?.content).toBe("new");
    expect(merged.records[hash].notes?.map((item) => item.id)).toEqual(["note-1", "note-2"]);
  });

  it("保留可移植存档中的 forceHorizontal 布尔设置", () => {
    const result = parseLibraryArchive({ version: 1, records: {}, settings: { forceHorizontal: true } });
    expect(result.errors).toHaveLength(0);
    expect(result.archive.settings?.forceHorizontal).toBe(true);
  });

  it("保留可移植存档中的 preloadNextChapter 布尔设置，并兼容旧存档缺省字段", () => {
    const old = parseLibraryArchive({ version: 1, records: {} });
    expect(old.errors).toHaveLength(0);
    expect(old.archive.settings).toBeUndefined();

    const result = parseLibraryArchive({ version: 1, records: {}, settings: { preloadNextChapter: true } });
    expect(result.errors).toHaveLength(0);
    expect(result.archive.settings?.preloadNextChapter).toBe(true);
  });
});
