import { describe, expect, it } from "vitest";
import type { ShelfEntry } from "./shelf";
import {
  archiveRecordsForBackend,
  buildLibraryArchive,
  projectArchiveToBrowserShelf,
} from "./libraryArchiveBridge";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function entry(hash: string, extra: Record<string, unknown> = {}): ShelfEntry {
  return {
    id: `bytes-${hash.slice(0, 4)}`,
    title: "Title / file:// is ordinary metadata",
    creator: "Creator",
    fileName: "book.epub",
    fileSize: 42,
    coverMime: "image/jpeg",
    addedAtMs: 10,
    lastReadAtMs: 20,
    spineIndex: 1,
    page: 2,
    progressPct: 30,
    anchorIndex: 4,
    anchorRatio: 0.5,
    contentHash: hash,
    isNew: false,
    bookmarks: [],
    ...extra,
  };
}

describe("library archive bridge", () => {
  it("whitelists portable fields and strips device metadata and paths", () => {
    const source = {
      ...entry(hashA, { fileName: "C:\\Users\\me\\book.epub", sourcePath: "/home/me/book.epub" }),
      available: true,
      bytes: new Uint8Array([1, 2, 3]),
    } as ShelfEntry & { available: boolean; bytes: Uint8Array; sourcePath: string };
    const archive = buildLibraryArchive([source], {
      fontSizePx: 18,
      theme: "dark",
      uiScale: 1.1,
      customFonts: [{ family: "private", url: "file:///C:/private.woff2" }],
    });
    const json = JSON.stringify(archive);
    expect(json).not.toContain("sourcePath");
    expect(json).not.toContain("Users");
    expect(json).not.toContain("available");
    expect(json).not.toContain("fileSize");
    expect(json).not.toContain("coverMime");
    expect(json).not.toContain("customFonts");
    expect(archive.records[hashA].fileName).toBe("book.epub");
    expect(archive.records[hashA].anchorTextOffset).toBeNull();
    expect(archive.records[hashA].anchorTextSnippet).toBeNull();
    expect(archive.settings).toEqual({ fontSizePx: 18, theme: "dark", uiScale: 1.1 });
  });

  it("round-trips text anchors through the portable bridge", () => {
    const archive = buildLibraryArchive([
      entry(hashA, { anchorTextOffset: 7, anchorTextSnippet: "😀正文" }),
    ]);
    const projected = projectArchiveToBrowserShelf([], archive);
    expect(projected[0]).toMatchObject({
      anchorTextOffset: 7,
      anchorTextSnippet: "😀正文",
    });
  });

  it("keeps a text-only bookmark portable without serializing the internal legacy sentinel", () => {
    const archive = buildLibraryArchive([
      entry(hashA, {
        bookmarks: [{
          id: "b",
          spineIndex: 1,
          page: 2,
          anchorIndex: null,
          anchorRatio: null,
          anchorTextOffset: 42,
          anchorTextSnippet: "正文",
          text: "正文",
          createdAtMs: 1,
        }],
      }),
    ]);
    const bookmark = archive.records[hashA].bookmarks[0];
    expect(bookmark).toMatchObject({
      anchorIndex: null,
      anchorRatio: null,
      anchorTextOffset: 42,
      anchorTextSnippet: "正文",
    });
    expect(archiveRecordsForBackend(archive)[0].bookmarks[0]).toMatchObject(bookmark);
  });

  it("returns a backend array without the keyed records wrapper", () => {
    const archive = buildLibraryArchive([entry(hashA)]);
    const records = archiveRecordsForBackend(archive);
    expect(records).toHaveLength(1);
    expect(records[0].contentHash).toBe(hashA);
    expect(JSON.stringify(records)).not.toContain("fileSize");
  });

  it("projects archive state while preserving browser byte identity and local metadata", () => {
    const local = {
      ...entry(hashA, { title: "old", fileSize: 99, coverMime: "image/png" }),
      available: true,
      sourcePath: "C:\\Users\\me\\book.epub",
    } as ShelfEntry & { available: boolean; sourcePath: string };
    const archive = buildLibraryArchive([
      entry(hashA, { title: "new", progressPct: 80 }),
      entry(hashB, { title: "remote" }),
    ]);
    const projected = projectArchiveToBrowserShelf([local], archive);
    expect(projected).toHaveLength(2);
    expect(projected[0].id).toBe(local.id);
    expect(projected[0].title).toBe("new");
    expect(projected[0].fileSize).toBe(99);
    expect(projected[0].coverMime).toBe("image/png");
    expect(projected[0].available).toBe(true);
    expect(projected[1].id).toBe(hashB);
    expect(projected[1].available).toBe(false);
    expect(projected[1].fileSize).toBe(0);
    expect(JSON.stringify(projected)).not.toContain("sourcePath");
    expect(JSON.stringify(projected)).not.toContain("Users");
  });
});
