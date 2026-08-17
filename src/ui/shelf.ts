import { invoke } from "@tauri-apps/api/core";

/** 书签：记录跳转回阅读进度用。 */
export interface Bookmark {
  id: string;
  spineIndex: number;
  page: number;
  anchorIndex: number | null;
  anchorRatio: number | null;
  /** 创建时锚点所在行文字，用于列表展示 */
  text: string;
  createdAtMs: number;
}

/** 书架条目（与 Rust ShelfEntry 字段一致，camelCase 序列化）。 */
export interface ShelfEntry {
  id: string;
  title: string;
  creator: string;
  fileName: string;
  fileSize: number;
  coverMime: string;
  addedAtMs: number;
  lastReadAtMs: number;
  spineIndex: number;
  page: number;
  progressPct: number;
  anchorIndex: number | null;
  anchorRatio: number | null;
  /** EPUB 原始字节的 SHA-256；0.1.5 旧条目允许缺失并在判重时懒补。 */
  contentHash?: string;
  /** 新导入且尚未打开过：书架显示“新”标记，第一次打开后清除 */
  isNew: boolean;
  /** 该书签（随书删除；旧条目缺省为空数组） */
  bookmarks?: Bookmark[];
}

export interface ShelfProgressPatch {
  lastReadAtMs: number;
  spineIndex: number;
  page: number;
  progressPct: number;
  anchorIndex: number | null;
  anchorRatio: number | null;
}

export interface ShelfSaveInput {
  entry: Omit<
    ShelfEntry,
    "progressPct" | "lastReadAtMs" | "spineIndex" | "page" | "anchorIndex" | "anchorRatio" | "isNew"
  > & {
    progressPct?: number;
    lastReadAtMs?: number;
    spineIndex?: number;
    page?: number;
    anchorIndex?: number | null;
    anchorRatio?: number | null;
    isNew?: boolean;
  };
  bytes: Uint8Array;
  coverBytes?: Uint8Array;
  coverMime?: string;
  /** Tauri 原生拖放来源；后端可直接复制，浏览器后端忽略。 */
  sourcePath?: string;
}

export interface ShelfSaveResult {
  status: "saved" | "duplicate";
  entry: ShelfEntry;
}

export interface ShelfStore {
  list(): Promise<ShelfEntry[]>;
  save(input: ShelfSaveInput): Promise<ShelfSaveResult>;
  readBook(id: string): Promise<Uint8Array>;
  readCover(id: string): Promise<Uint8Array | null>;
  /** 只为旧条目补录内容指纹，不得改动阅读进度或其他元数据。 */
  setContentHash(id: string, contentHash: string): Promise<ShelfEntry>;
  updateProgress(id: string, patch: ShelfProgressPatch): Promise<ShelfEntry>;
  /** 第一次从书架打开：清除“新”标记 */
  markOpened(id: string): Promise<ShelfEntry>;
  /** 写入整本书的书签列表（随书删除） */
  setBookmarks(id: string, bookmarks: Bookmark[]): Promise<ShelfEntry>;
  deleteBook(id: string): Promise<void>;
}

export function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 0.1.5 旧版 ID 算法；保留用于兼容与历史测试，新导入使用内容 SHA-256。 */
export function shelfIdFor(identifier: string, fileName: string, fileSize: number): string {
  const text = `${identifier}|${fileName}|${fileSize}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type ShelfSort = "recent" | "added" | "title";

export function sortShelfEntries(entries: ShelfEntry[], sort: ShelfSort): ShelfEntry[] {
  const list = [...entries];
  switch (sort) {
    case "added":
      return list.sort((a, b) => b.addedAtMs - a.addedAtMs);
    case "title":
      return list.sort((a, b) =>
        a.title.localeCompare(b.title, "zh-Hans-CN", { numeric: true })
      );
    case "recent":
      return list.sort((a, b) => b.lastReadAtMs - a.lastReadAtMs);
  }
}

export function filterShelfEntries(entries: ShelfEntry[], query: string): ShelfEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) => e.title.toLowerCase().includes(q) || e.creator.toLowerCase().includes(q)
  );
}

export function applyShelfProgressPatch(
  entries: ShelfEntry[],
  id: string,
  patch: ShelfProgressPatch
): ShelfEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
}

/** 只清除新书标记；异步 markOpened 的旧返回值不能覆盖更新后的进度。 */
export function markShelfEntryOpened(entries: ShelfEntry[], id: string): ShelfEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, isNew: false } : entry));
}

export function formatShelfTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

// ---- IndexedDB（浏览器 dev / 非 Tauri 环境回退） ----

const DB_NAME = "epub-reader-shelf";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("covers")) {
        db.createObjectStore("covers", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("无法打开书架数据库"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("书架数据库事务失败"));
    tx.onabort = () => reject(tx.error ?? new Error("书架数据库事务中止"));
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("书架数据库请求失败"));
  });
}

function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((b) => new Uint8Array(b));
}

class IndexedDbShelfStore implements ShelfStore {
  async list(): Promise<ShelfEntry[]> {
    const db = await openDb();
    try {
      const all = await reqAsPromise(
        db.transaction("meta", "readonly").objectStore("meta").getAll()
      );
      return (all as ShelfEntry[]).filter((e) => e && typeof e.id === "string");
    } finally {
      db.close();
    }
  }

  async save(input: ShelfSaveInput): Promise<ShelfSaveResult> {
    const db = await openDb();
    try {
      const all = (await reqAsPromise(
        db.transaction("meta", "readonly").objectStore("meta").getAll()
      )) as ShelfEntry[];
      const contentHash = input.entry.contentHash;
      const duplicate = contentHash
        ? all.find((entry) => entry.contentHash === contentHash)
        : undefined;
      if (duplicate) return { status: "duplicate", entry: duplicate };
      const existing = all.find((entry) => entry.id === input.entry.id);
      if (existing && existing.contentHash !== contentHash) {
        throw new Error("书本 ID 冲突，已拒绝覆盖现有书籍");
      }
      const entry: ShelfEntry = {
        id: input.entry.id,
        title: input.entry.title,
        creator: input.entry.creator,
        fileName: input.entry.fileName,
        fileSize: input.entry.fileSize,
        coverMime:
          input.coverMime ??
          input.entry.coverMime ??
          existing?.coverMime ??
          "",
        addedAtMs: existing?.addedAtMs ?? input.entry.addedAtMs ?? Date.now(),
        lastReadAtMs: existing?.lastReadAtMs ?? input.entry.lastReadAtMs ?? Date.now(),
        spineIndex: existing?.spineIndex ?? input.entry.spineIndex ?? 0,
        page: existing?.page ?? input.entry.page ?? 0,
        progressPct: existing?.progressPct ?? input.entry.progressPct ?? 0,
        anchorIndex: existing?.anchorIndex ?? input.entry.anchorIndex ?? null,
        anchorRatio: existing?.anchorRatio ?? input.entry.anchorRatio ?? null,
        contentHash,
        isNew: existing?.isNew ?? input.entry.isNew ?? true,
        bookmarks: existing?.bookmarks ?? input.entry.bookmarks ?? [],
      };
      const tx = db.transaction(["meta", "books", "covers"], "readwrite");
      tx.objectStore("meta").put(entry);
      tx.objectStore("books").put({
        id: entry.id,
        bytes: new Blob([input.bytes.slice().buffer as ArrayBuffer]),
      });
      if (input.coverBytes && input.coverBytes.byteLength > 0) {
        tx.objectStore("covers").put({
          id: entry.id,
          mime: entry.coverMime,
          bytes: new Blob([input.coverBytes.slice().buffer as ArrayBuffer]),
        });
      } else if (!existing) {
        tx.objectStore("covers").delete(entry.id);
      }
      await txDone(tx);
      return { status: "saved", entry };
    } finally {
      db.close();
    }
  }

  async readBook(id: string): Promise<Uint8Array> {
    const db = await openDb();
    try {
      const row = (await reqAsPromise(
        db.transaction("books", "readonly").objectStore("books").get(id)
      )) as { bytes?: Blob } | undefined;
      if (!row?.bytes) throw new Error("书架中没有这本书的数据");
      return await blobToBytes(row.bytes);
    } finally {
      db.close();
    }
  }

  async readCover(id: string): Promise<Uint8Array | null> {
    const db = await openDb();
    try {
      const row = (await reqAsPromise(
        db.transaction("covers", "readonly").objectStore("covers").get(id)
      )) as { bytes?: Blob } | undefined;
      return row?.bytes ? await blobToBytes(row.bytes) : null;
    } finally {
      db.close();
    }
  }

  async setContentHash(id: string, contentHash: string): Promise<ShelfEntry> {
    const db = await openDb();
    try {
      const tx = db.transaction("meta", "readwrite");
      const store = tx.objectStore("meta");
      const current = (await reqAsPromise(store.get(id))) as ShelfEntry | undefined;
      if (!current) throw new Error("书架中没有这本书");
      const next: ShelfEntry = { ...current, contentHash };
      store.put(next);
      await txDone(tx);
      return next;
    } finally {
      db.close();
    }
  }

  async updateProgress(id: string, patch: ShelfProgressPatch): Promise<ShelfEntry> {
    const db = await openDb();
    try {
      const tx = db.transaction("meta", "readwrite");
      const store = tx.objectStore("meta");
      const current = (await reqAsPromise(store.get(id))) as ShelfEntry | undefined;
      if (!current) throw new Error("书架中没有这本书");
      const next: ShelfEntry = { ...current, ...patch };
      store.put(next);
      await txDone(tx);
      return next;
    } finally {
      db.close();
    }
  }

  async markOpened(id: string): Promise<ShelfEntry> {
    const db = await openDb();
    try {
      const tx = db.transaction("meta", "readwrite");
      const store = tx.objectStore("meta");
      const current = (await reqAsPromise(store.get(id))) as ShelfEntry | undefined;
      if (!current) throw new Error("书架中没有这本书");
      const next: ShelfEntry = { ...current, isNew: false };
      store.put(next);
      await txDone(tx);
      return next;
    } finally {
      db.close();
    }
  }

  async setBookmarks(id: string, bookmarks: Bookmark[]): Promise<ShelfEntry> {
    const db = await openDb();
    try {
      const tx = db.transaction("meta", "readwrite");
      const store = tx.objectStore("meta");
      const current = (await reqAsPromise(store.get(id))) as ShelfEntry | undefined;
      if (!current) throw new Error("书架中没有这本书");
      const next: ShelfEntry = { ...current, bookmarks };
      store.put(next);
      await txDone(tx);
      return next;
    } finally {
      db.close();
    }
  }

  async deleteBook(id: string): Promise<void> {
    const db = await openDb();
    try {
      const tx = db.transaction(["meta", "books", "covers"], "readwrite");
      tx.objectStore("meta").delete(id);
      tx.objectStore("books").delete(id);
      tx.objectStore("covers").delete(id);
      await txDone(tx);
    } finally {
      db.close();
    }
  }
}

// ---- Tauri 实现（书文件存应用数据目录，跨平台一致） ----

class TauriShelfStore implements ShelfStore {
  async list(): Promise<ShelfEntry[]> {
    return invoke<ShelfEntry[]>("shelf_list");
  }

  async save(input: ShelfSaveInput): Promise<ShelfSaveResult> {
    const bookId = input.entry.id;
    if (input.sourcePath) {
      await invoke("shelf_stage_book_path", {
        bookId,
        sourcePath: input.sourcePath,
        expectedSize: input.bytes.byteLength,
      });
    } else {
      await invoke("shelf_stage_book_raw", input.bytes, {
        headers: { "x-book-id": bookId },
      });
    }
    let hasCover = false;
    if (input.coverBytes && input.coverBytes.byteLength > 0) {
      try {
        await invoke("shelf_stage_cover_raw", input.coverBytes, {
          headers: { "x-book-id": bookId },
        });
        hasCover = true;
      } catch {
        // 封面保存失败不视为导入失败，书架用占位封面
      }
    }
    return invoke<ShelfSaveResult>("shelf_commit_book", {
      bookId,
      title: input.entry.title,
      creator: input.entry.creator,
      fileName: input.entry.fileName,
      fileSize: input.entry.fileSize,
      contentHash: input.entry.contentHash ?? "",
      coverMime: hasCover ? input.coverMime ?? "image/jpeg" : "",
      hasCover,
    });
  }

  async readBook(id: string): Promise<Uint8Array> {
    const buf = await invoke<ArrayBuffer>("shelf_read_book", { bookId: id });
    return new Uint8Array(buf);
  }

  async readCover(id: string): Promise<Uint8Array | null> {
    const buf = await invoke<ArrayBuffer>("shelf_read_cover", { bookId: id });
    return buf.byteLength > 0 ? new Uint8Array(buf) : null;
  }

  async setContentHash(id: string, contentHash: string): Promise<ShelfEntry> {
    return invoke<ShelfEntry>("shelf_set_content_hash", { bookId: id, contentHash });
  }

  async updateProgress(id: string, patch: ShelfProgressPatch): Promise<ShelfEntry> {
    return invoke<ShelfEntry>("shelf_update_entry", {
      bookId: id,
      lastReadAtMs: patch.lastReadAtMs,
      spineIndex: patch.spineIndex,
      page: patch.page,
      progressPct: patch.progressPct,
      anchorIndex: patch.anchorIndex,
      anchorRatio: patch.anchorRatio,
    });
  }

  async markOpened(id: string): Promise<ShelfEntry> {
    return invoke<ShelfEntry>("shelf_mark_opened", { bookId: id });
  }

  async setBookmarks(id: string, bookmarks: Bookmark[]): Promise<ShelfEntry> {
    return invoke<ShelfEntry>("shelf_set_bookmarks", { bookId: id, bookmarks });
  }

  async deleteBook(id: string): Promise<void> {
    await invoke("shelf_delete_book", { bookId: id });
  }
}

let cachedStore: ShelfStore | null = null;

export function getShelfStore(): ShelfStore {
  if (!cachedStore) {
    cachedStore = isTauriEnv() ? new TauriShelfStore() : new IndexedDbShelfStore();
  }
  return cachedStore;
}

/** 测试用：重置缓存的 store。 */
export function resetShelfStoreForTest(): void {
  cachedStore = null;
}
