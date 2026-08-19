import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { loadBook, spineIndexForPath, spineItemPath, DrmError } from "./core/book";
import type { Book } from "./core/types";
import { isFragmentOnly, resolvePath, splitHref } from "./core/paths";
import { ResourceServer } from "./render/resources";
import {
  DEFAULT_SETTINGS,
  STANDARD_PAGE_CHARS,
  type ReaderSettings,
  type Theme,
} from "./render/settings";
import type { ChapterState, FootnotePayload } from "./render/paginator";
import { Toolbar } from "./ui/Toolbar";
import { MenuPanel } from "./ui/MenuPanel";
import { FootnotePop } from "./ui/FootnotePop";
import { TocPanel } from "./ui/TocPanel";
import { LogPanel, type LogItem } from "./ui/LogPanel";
import { ReaderView, type ReaderHandle } from "./ui/ReaderView";
import { ShelfView } from "./ui/ShelfView";
import {
  applyShelfProgressPatch,
  getShelfStore,
  markShelfEntryOpened,
  shelfThumbnailProvider,
  type Bookmark,
  type ShelfEntry,
  type ShelfProgressPatch,
} from "./ui/shelf";
import {
  formatImportNotice,
  findDuplicateEntry,
  mergeShelfEntries,
  sha256Hex,
} from "./ui/importBooks";
import { ShelfProgressWriter } from "./ui/progressWriter";
import {
  archiveRecordsForBackend,
  buildLibraryArchiveWithIssues,
} from "./ui/libraryArchiveBridge";
import {
  exportLibraryArchive,
  mergeLibraryArchives,
  parseLibraryArchive,
} from "./ui/libraryArchive";
import {
  emptyReaderNavigationHistory,
  readerHistoryBack,
  readerHistoryForward,
  recordReaderNavigation,
  type ReaderNavigationHistory,
  type ReaderNavigationPosition,
} from "./ui/readerNavigationHistory";
import {
  fontFamilyFromFileName,
  fontIdFromHash,
  getFontStore,
  type UserFont,
} from "./ui/fontStore";
import {
  readProgress,
  writeProgress,
  readSavedSettings,
  writeSavedSettings,
  type SavedProgress,
} from "./ui/storage";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, stat as statFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";

function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type AppPhase =
  | { phase: "idle" }
  | { phase: "loading"; fileName: string }
  | { phase: "error"; message: string }
  | { phase: "ready" };

type ReaderHistoryPosition = ReaderNavigationPosition;

type ImportSource =
  | { kind: "file"; file: File }
  | { kind: "path"; path: string; name: string };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function firstLinear(b: Book): number {
  const i = b.spine.findIndex((s) => s.linear);
  return i >= 0 ? i : 0;
}

function bookKeyOf(b: Book, name: string, size: number): string {
  const id = b.metadata.identifier || `${name}:${size}`;
  return `${id}::${b.metadata.modified ?? ""}`;
}

/** 根据 spine 下标查目录章节标题（用于书签右下角展示）。 */
function chapterLabelForIndex(b: Book, index: number): string {
  const path = spineItemPath(b, index);
  if (!path) return "";
  const { path: normalized } = splitHref(path);
  const walk = (nodes: import("./core/types").TocNode[]): string => {
    for (const n of nodes) {
      if (splitHref(n.href).path === normalized && n.label) return n.label;
      const c = walk(n.children);
      if (c) return c;
    }
    return "";
  };
  return walk(b.toc);
}

export default function App() {
  const [phase, setPhase] = useState<AppPhase>({ phase: "idle" });
  const [book, setBook] = useState<Book | null>(null);
  const [server, setServer] = useState<ResourceServer | null>(null);
  const [bookKey, setBookKey] = useState("");
  const [spineIndex, setSpineIndex] = useState(0);
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const [anchorNonce, setAnchorNonce] = useState(0);
  const [startAtEnd, setStartAtEnd] = useState({ nonce: 0, atEnd: false });
  const [footnote, setFootnote] = useState<FootnotePayload | null>(null);
  const [chapterState, setChapterState] = useState<ChapterState>({ status: "loading" });
  const [readerDisplayReady, setReaderDisplayReady] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const saved = readSavedSettings();
    return {
      ...DEFAULT_SETTINGS,
      fontSizePx: saved.fontSizePx ?? DEFAULT_SETTINGS.fontSizePx,
      theme: saved.theme ?? DEFAULT_SETTINGS.theme,
      lineHeight: saved.lineHeight,
      fontWeight: saved.fontWeight,
      letterSpacingPx: saved.letterSpacingPx,
      wordSpacingPx: saved.wordSpacingPx,
      customFontName: saved.customFontName,
      customCss: saved.customCss,
    };
  });
  // UI 界面缩放（独立于正文字号）
  const [uiScale, setUiScale] = useState<number>(() => {
    const saved = readSavedSettings();
    return saved.uiScale !== undefined &&
      saved.uiScale >= 0.75 &&
      saved.uiScale <= 1.5
      ? saved.uiScale
      : 1;
  });
  const [tocOpen, setTocOpen] = useState(false); // 悬浮目录默认收起
  const [menuOpen, setMenuOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [runtimeIssues, setRuntimeIssues] = useState<string[]>([]);
  const [diagText, setDiagText] = useState<string | null>(null);
  const [initialAnchor, setInitialAnchor] = useState<{ index: number; ratio: number } | null>(
    null
  );
  /** 各线性章节的有效字数（标准页进度分母） */
  const [chapterChars, setChapterChars] = useState<number[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const [dragActive, setDragActive] = useState(false);
  // ---- 书架 ----
  const [view, setView] = useState<"shelf" | "reader">("shelf");
  const [shelfEntries, setShelfEntries] = useState<ShelfEntry[]>([]);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [shelfNotice, setShelfNotice] = useState<{
    kind: "ok" | "warn" | "error";
    text: string;
  } | null>(null);
  const [shelfNoticeFading, setShelfNoticeFading] = useState(false);
  const [shelfBusy, setShelfBusy] = useState(false);
  const [currentShelfId, setCurrentShelfId] = useState<string | null>(null);
  const shelfBusyRef = useRef(false);
  const shelfEntriesRef = useRef<ShelfEntry[]>([]);
  shelfEntriesRef.current = shelfEntries;
  // ---- 阅读跳转历史（后退/前进各最多 3 步） ----
  const [readerHistory, setReaderHistory] = useState<ReaderNavigationHistory>(
    emptyReaderNavigationHistory
  );
  const [bookmarkMenuOpen, setBookmarkMenuOpen] = useState(false);
  // ---- 用户自定义字体 ----
  const [userFonts, setUserFonts] = useState<UserFont[]>([]);
  const [fontUrls, setFontUrls] = useState<Record<string, string>>({});
  const [fontBusy, setFontBusy] = useState(false);
  const contentHashByIdRef = useRef(new Map<string, string>());
  const entryByContentHashRef = useRef(new Map<string, ShelfEntry>());
  const currentShelfIds = new Set(shelfEntries.map((entry) => entry.id));
  for (const [id, hash] of contentHashByIdRef.current) {
    if (!currentShelfIds.has(id)) {
      contentHashByIdRef.current.delete(id);
      entryByContentHashRef.current.delete(hash);
    }
  }
  for (const entry of shelfEntries) {
    if (!entry.contentHash) continue;
    contentHashByIdRef.current.set(entry.id, entry.contentHash);
    entryByContentHashRef.current.set(entry.contentHash, entry);
  }
  const progressWriterRef = useRef<ShelfProgressWriter | null>(null);
  if (!progressWriterRef.current) {
    progressWriterRef.current = new ShelfProgressWriter(async (id, patch) => {
      await getShelfStore().updateProgress(id, patch);
    });
  }
  /** 指针是否悬停在交互式浮层（脚注弹窗等）上：此时不响应翻页键/后续可扩展书签等 */
  const overlayHoverRef = useRef(false);

  const readerRef = useRef<ReaderHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialPagePendingRef = useRef(false);
  const initialPageRef = useRef(0);
  const chapterStateRef = useRef<ChapterState>(chapterState);
  chapterStateRef.current = chapterState;
  const navigationPendingRef = useRef(false);
  // 每个稳定位置只能被一次显式跳转捕获；新书初始加载时
  // 仍允许以已保存的基线位置记录“第一次跳转”。
  const historyCaptureAllowedRef = useRef(true);
  const lastStablePositionRef = useRef<ReaderHistoryPosition>({
    spineIndex: 0,
    page: 0,
    anchor: null,
  });
  const persistShelfProgressRef = useRef<() => void>(() => {});

  // ---- 打开书（书架导入/书架打开共用；只承载阅读器状态，不改渲染核心） ----
  const openParsedBook = useCallback(
    (
      b: Book,
      srv: ResourceServer,
      chars: number[],
      fileName: string,
      fileSize: number,
      savedOverride: SavedProgress | null,
      shelfId: string | null
    ) => {
      setChapterChars(chars);
      const key = bookKeyOf(b, fileName, fileSize);
      const saved = savedOverride ?? readProgress(key);
      const start = clamp(saved?.spineIndex ?? firstLinear(b), 0, b.spine.length - 1);
      setBook(b);
      setServer(srv);
      setBookKey(key);
      setRuntimeIssues([]);
      setChapterState({ status: "loading" });
      setReaderDisplayReady(false);
      setSpineIndex(start);
      setAnchor(undefined);
      initialPagePendingRef.current = true;
      initialPageRef.current = saved?.page ?? 0;
      setInitialAnchor(saved?.anchor ?? null);
      lastStablePositionRef.current = {
        spineIndex: start,
        page: saved?.page ?? 0,
        anchor: saved?.anchor ?? null,
      };
      navigationPendingRef.current = true;
      historyCaptureAllowedRef.current = true;
      setCurrentShelfId(shelfId);
      setReaderHistory(emptyReaderNavigationHistory());
      setBookmarkMenuOpen(false);
      setView("reader");
      setPhase({ phase: "ready" });
    },
    []
  );

  // ---- 批量导入 EPUB 并入库（逐本有界处理；结束后只刷新一次书架） ----
  const handleImportSources = useCallback(async (sources: ImportSource[]) => {
    const list = sources.filter((source) => {
      const name = source.kind === "file" ? source.file.name : source.name;
      return name.toLowerCase().endsWith(".epub");
    });
    if (list.length === 0 || shelfBusyRef.current) return;
    shelfBusyRef.current = true;
    setShelfBusy(true);
    setShelfNotice(null);
    const imported: ShelfEntry[] = [];
    const duplicateTitles: string[] = [];
    const failed: string[] = [];
    const store = getShelfStore();

    try {
      if (isTauriEnv()) {
        const paths = list.flatMap((source) => source.kind === "path" ? [source.path] : []);
        if (paths.length !== list.length) {
          throw new Error("桌面版导入必须保留用户选择的源文件路径");
        }
        const batch = await store.importPaths(paths);
        for (const item of batch.results) {
          const source = list[item.inputIndex];
          const fileName = source?.kind === "path" ? source.name : `第 ${item.inputIndex + 1} 本`;
          if (item.status === "failed") {
            failed.push(`${fileName}：${item.error || "导入失败"}`);
            continue;
          }
          if (!item.record) {
            failed.push(`${fileName}：后端未返回书架记录`);
            continue;
          }
          contentHashByIdRef.current.set(item.record.id, item.record.contentHash ?? item.record.id);
          entryByContentHashRef.current.set(item.record.contentHash ?? item.record.id, item.record);
          if (item.status === "duplicate") {
            duplicateTitles.push(item.record.title || fileName.replace(/\.epub$/i, ""));
          } else {
            imported.push(item.record);
          }
        }
      } else {
        for (const source of list) {
          const fileName = source.kind === "file" ? source.file.name : source.name;
          try {
            if (source.kind !== "file") {
              throw new Error("浏览器预览无法读取原生文件路径");
            }
            const arrayBuffer = await source.file.arrayBuffer();
            const buf = new Uint8Array(arrayBuffer);
            const contentHash = await sha256Hex(buf);

            const duplicate = await findDuplicateEntry({
              incomingHash: contentHash,
              incomingSize: buf.byteLength,
              entries: shelfEntriesRef.current,
              contentHashById: contentHashByIdRef.current,
              entryByContentHash: entryByContentHashRef.current,
              readBook: (id) => store.readBook(id),
              setContentHash: (id, hash) => store.setContentHash(id, hash),
            });

            if (duplicate && duplicate.available !== false) {
              duplicateTitles.push(duplicate.title || fileName.replace(/\.epub$/i, ""));
              continue;
            }

            const b = await loadBook(buf);
            if (b.spine.length === 0) {
              throw new Error("书中没有可阅读的内容（spine 为空）");
            }
            const cover = b.coverHref ? b.resources.get(b.coverHref) : undefined;
            const result = await store.save({
              entry: {
                id: contentHash,
                title: b.metadata.title || fileName.replace(/\.epub$/i, ""),
                creator: b.metadata.creator ?? "",
                fileName,
                fileSize: buf.byteLength,
                coverMime: cover?.mediaType ?? "",
                contentHash,
                addedAtMs: Date.now(),
              },
              bytes: buf,
              coverBytes: cover?.data,
              coverMime: cover?.mediaType,
            });
            contentHashByIdRef.current.set(result.entry.id, contentHash);
            entryByContentHashRef.current.set(contentHash, result.entry);
            if (result.status === "duplicate") {
              duplicateTitles.push(result.entry.title || fileName.replace(/\.epub$/i, ""));
            } else {
              imported.push(result.entry);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failed.push(
              `${fileName}：${error instanceof DrmError ? error.message : message}`
            );
          }
        }
      }

      if (imported.length > 0) {
        setShelfEntries((previous) => mergeShelfEntries(previous, imported));
      }
      setShelfNotice(
        formatImportNotice({
          sourceCount: list.length,
          importedCount: imported.length,
          duplicateTitles,
          failed,
        })
      );
    } catch (error) {
      setShelfNotice({ kind: "error", text: `导入失败：${String(error)}` });
    } finally {
      shelfBusyRef.current = false;
      setShelfBusy(false);
    }
  }, []);

  const handleChooseBooks = useCallback(async () => {
    if (!isTauriEnv()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const selected = await openFileDialog({
        multiple: true,
        directory: false,
        title: "选择 EPUB 书籍",
        filters: [{ name: "EPUB 电子书", extensions: ["epub"] }],
      });
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
      if (paths.length === 0) return;
      await handleImportSources(
        paths.map((path) => ({
          kind: "path" as const,
          path,
          name: path.split(/[\\/]/).pop() || "book.epub",
        }))
      );
    } catch (error) {
      setShelfNotice({ kind: "error", text: `无法打开文件选择器：${String(error)}` });
    }
  }, [handleImportSources]);

  const handleExportArchive = useCallback(async () => {
    try {
      const built = buildLibraryArchiveWithIssues(shelfEntriesRef.current, {
        ...settings,
        uiScale,
      });
      if (built.skipped.length > 0) {
        throw new Error(`有 ${built.skipped.length} 条书架记录缺少有效内容指纹`);
      }
      const text = exportLibraryArchive(built.archive);
      if (isTauriEnv()) {
        const path = await saveFileDialog({
          title: "导出阅读存档",
          defaultPath: `epub-reader-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: "EPUB Reader 存档", extensions: ["json"] }],
        });
        if (!path) return;
        await writeTextFile(path, text);
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `epub-reader-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
      setShelfNotice({ kind: "ok", text: `已导出 ${Object.keys(built.archive.records).length} 本书的存档` });
    } catch (error) {
      setShelfNotice({ kind: "error", text: `存档导出失败：${String(error)}` });
    }
  }, [settings, uiScale]);

  const handleImportArchive = useCallback(async () => {
    if (shelfBusyRef.current) return;
    shelfBusyRef.current = true;
    setShelfBusy(true);
    try {
      let text: string | null = null;
      if (isTauriEnv()) {
        const path = await openFileDialog({
          multiple: false,
          directory: false,
          title: "导入阅读存档",
          filters: [{ name: "EPUB Reader 存档", extensions: ["json"] }],
        });
        if (path && !Array.isArray(path)) {
          if ((await statFile(path)).size > 16 * 1024 * 1024) {
            throw new Error("存档文件超过 16 MiB，已拒绝读取");
          }
          text = await readTextFile(path);
        }
      } else {
        text = await new Promise<string | null>((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "application/json,.json";
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) resolve(null);
            else if (file.size > 16 * 1024 * 1024) {
              setShelfNotice({ kind: "error", text: "存档文件超过 16 MiB，已拒绝读取" });
              resolve(null);
            }
            else void file.text().then(resolve, () => resolve(null));
          };
          input.addEventListener("cancel", () => resolve(null), { once: true });
          input.click();
        });
      }
      if (text === null) return;
      const incoming = parseLibraryArchive(text);
      if (incoming.errors.length > 0) {
        const first = incoming.errors[0];
        throw new Error(`${first.path}：${first.message}（共 ${incoming.errors.length} 项）`);
      }
      const current = buildLibraryArchiveWithIssues(shelfEntriesRef.current, {
        ...settings,
        uiScale,
      });
      if (current.skipped.length > 0) {
        throw new Error(`当前书架有 ${current.skipped.length} 条记录缺少有效内容指纹`);
      }
      const merged = mergeLibraryArchives(current.archive, incoming.archive);
      const nextEntries = await getShelfStore().replacePortableRecords(
        archiveRecordsForBackend(merged)
      );
      setShelfEntries(nextEntries);

      const importedSettings = merged.settings ?? {};
      setSettings((previous) => ({
        ...previous,
        ...(typeof importedSettings.fontSizePx === "number" && importedSettings.fontSizePx >= 12 && importedSettings.fontSizePx <= 32
          ? { fontSizePx: importedSettings.fontSizePx }
          : {}),
        ...(importedSettings.theme === "light" || importedSettings.theme === "dark" || importedSettings.theme === "sepia"
          ? { theme: importedSettings.theme }
          : {}),
        ...(typeof importedSettings.gapPx === "number" && importedSettings.gapPx >= 0 && importedSettings.gapPx <= 96
          ? { gapPx: importedSettings.gapPx }
          : {}),
        ...(typeof importedSettings.fontFamily === "string" ? { fontFamily: importedSettings.fontFamily } : {}),
        ...(typeof importedSettings.lineHeight === "number" && importedSettings.lineHeight >= 1 && importedSettings.lineHeight <= 3 ? { lineHeight: importedSettings.lineHeight } : {}),
        ...(typeof importedSettings.fontWeight === "number" && importedSettings.fontWeight >= 100 && importedSettings.fontWeight <= 900 ? { fontWeight: importedSettings.fontWeight } : {}),
        ...(typeof importedSettings.letterSpacingPx === "number" && importedSettings.letterSpacingPx >= 0 && importedSettings.letterSpacingPx <= 32 ? { letterSpacingPx: importedSettings.letterSpacingPx } : {}),
        ...(typeof importedSettings.wordSpacingPx === "number" && importedSettings.wordSpacingPx >= 0 && importedSettings.wordSpacingPx <= 64 ? { wordSpacingPx: importedSettings.wordSpacingPx } : {}),
        ...(typeof importedSettings.customFontName === "string" ? { customFontName: importedSettings.customFontName } : {}),
        ...(typeof importedSettings.customCss === "string" ? { customCss: importedSettings.customCss } : {}),
      }));
      if (typeof importedSettings.uiScale === "number" && importedSettings.uiScale >= 0.75 && importedSettings.uiScale <= 1.5) {
        setUiScale(importedSettings.uiScale);
      }
      const unavailableCount = nextEntries.filter((entry) => entry.available === false).length;
      setShelfNotice({
        kind: unavailableCount > 0 ? "warn" : "ok",
        text: `已合并 ${Object.keys(incoming.archive.records).length} 本书的存档${unavailableCount > 0 ? `；${unavailableCount} 本需重新定位源文件` : ""}`,
      });
    } catch (error) {
      setShelfNotice({ kind: "error", text: `存档导入失败：${String(error)}` });
    } finally {
      shelfBusyRef.current = false;
      setShelfBusy(false);
    }
  }, [settings, uiScale]);

  // ---- 书架启动加载 ----
  useEffect(() => {
    let cancelled = false;
    getShelfStore()
      .list()
      .then((entries) => {
        if (!cancelled) setShelfEntries(entries);
      })
      .catch((e) => {
        if (!cancelled) setShelfError(`无法读取书架：${String(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- 用户自定义字体启动加载 ----
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      try {
        const fonts = await getFontStore().list();
        if (cancelled) return;
        setUserFonts(fonts);
        const urls: Record<string, string> = {};
        for (const font of fonts) {
          try {
            const bytes = await getFontStore().readFont(font.id);
            const url = URL.createObjectURL(
              new Blob([bytes.slice().buffer as ArrayBuffer])
            );
            created.push(url);
            urls[font.id] = url;
          } catch {
            /* 单个字体读取失败不影响其余 */
          }
        }
        if (!cancelled) setFontUrls(urls);
      } catch {
        /* 字体库不可用不阻塞阅读 */
      }
    })();
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, []);

  const handleImportFont = useCallback(async (file: File) => {
    if (fontBusy) return;
    if (!/\.(ttf|otf|woff|woff2)$/i.test(file.name)) {
      setShelfNotice({ kind: "error", text: "仅支持 TTF/OTF/WOFF/WOFF2 字体文件" });
      return;
    }
    setFontBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = await sha256Hex(bytes);
      const id = fontIdFromHash(hash);
      const family = fontFamilyFromFileName(file.name);
      const entry = await getFontStore().importFont({ id, fileName: file.name, family, bytes });
      const url = URL.createObjectURL(
        new Blob([bytes.slice().buffer as ArrayBuffer])
      );
      setUserFonts((prev) => [entry, ...prev.filter((f) => f.id !== id)]);
      setFontUrls((prev) => ({ ...prev, [id]: url }));
      setShelfNotice({ kind: "ok", text: `已导入字体：${family}` });
    } catch (e) {
      setShelfNotice({ kind: "error", text: `字体导入失败：${String(e)}` });
    } finally {
      setFontBusy(false);
    }
  }, [fontBusy]);

  const handleDeleteFont = useCallback(
    async (id: string) => {
      const font = userFonts.find((f) => f.id === id);
      setFontBusy(true);
      try {
        await getFontStore().deleteFont(id);
        if (fontUrls[id]) URL.revokeObjectURL(fontUrls[id]);
        setUserFonts((prev) => prev.filter((f) => f.id !== id));
        setFontUrls((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (font && settings.customFontName === font.family) {
          setSettings((s) => ({ ...s, customFontName: undefined }));
        }
      } catch (e) {
        setShelfNotice({ kind: "error", text: `字体删除失败：${String(e)}` });
      } finally {
        setFontBusy(false);
      }
    },
    [fontUrls, userFonts, settings.customFontName]
  );

  // 导入结果 toast：展示 3 秒后用 1 秒淡出，期间不拦截鼠标
  useEffect(() => {
    if (!shelfNotice) {
      setShelfNoticeFading(false);
      return;
    }
    setShelfNoticeFading(false);
    const fadeTimer = window.setTimeout(() => setShelfNoticeFading(true), 3000);
    const closeTimer = window.setTimeout(() => setShelfNotice(null), 4000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(closeTimer);
    };
  }, [shelfNotice]);

  // ---- 从书架打开 ----
  const handleShelfOpen = useCallback(
    async (id: string) => {
      if (shelfBusyRef.current) return;
      const originalEntry = shelfEntriesRef.current.find((e) => e.id === id);
      if (!originalEntry) return;
      shelfBusyRef.current = true;
      setShelfBusy(true);
      setShelfError(null);
      setPhase({ phase: "loading", fileName: originalEntry.fileName });
      try {
        let entry = originalEntry;
        if (isTauriEnv() && entry.available === false) {
          const selected = await openFileDialog({
            multiple: false,
            directory: false,
            title: `重新定位《${entry.title}》`,
            filters: [{ name: "EPUB 电子书", extensions: ["epub"] }],
          });
          if (!selected || Array.isArray(selected)) {
            shelfBusyRef.current = false;
            setShelfBusy(false);
            setPhase({ phase: "idle" });
            return;
          }
          entry = await getShelfStore().relink(id, selected);
          setShelfEntries((prev) =>
            prev.map((item) => (item.id === id ? entry : item))
          );
        }
        let buf: Uint8Array;
        try {
          buf = await getShelfStore().readBook(id);
        } catch (error) {
          setShelfEntries((prev) =>
            prev.map((item) => (item.id === id ? { ...item, available: false } : item))
          );
          throw error;
        }
        const b = await loadBook(buf);
        if (b.spine.length === 0) {
          setShelfError("这本书没有可阅读的内容");
          shelfBusyRef.current = false;
          setShelfBusy(false);
          return;
        }
        const srv = new ResourceServer(b);
        const stripTags = (t: string): string => t.replace(/<[^>]*>/g, "").replace(/\s/g, "");
        const chars: number[] = b.spine.map((item) => {
          if (!item.linear) return 0;
          const mi = b.manifest.get(item.idref);
          if (!mi) return 0;
          const p = resolvePath(b.opfPath, mi.href);
          const text = srv.textFor(p);
          return text ? stripTags(text).length : 0;
        });
        const saved: SavedProgress = {
          spineIndex: entry.spineIndex,
          page: entry.page,
          anchor:
            entry.anchorIndex !== null && entry.anchorIndex !== undefined &&
            entry.anchorRatio !== null && entry.anchorRatio !== undefined
              ? { index: entry.anchorIndex, ratio: entry.anchorRatio }
              : null,
        };
        // 第一次打开：立即清除“新”标记（后端落盘异步完成，不阻塞阅读）
        if (entry.isNew) {
          setShelfEntries((prev) => markShelfEntryOpened(prev, id));
          void getShelfStore()
            .markOpened(id)
            .then(() => setShelfEntries((prev) => markShelfEntryOpened(prev, id)))
            .catch(() => {
              /* 下次打开时再尝试清除 */
            });
        }
        openParsedBook(b, srv, chars, entry.fileName, entry.fileSize, saved, id);
        shelfBusyRef.current = false;
        setShelfBusy(false);
      } catch (e) {
        shelfBusyRef.current = false;
        setShelfBusy(false);
        setShelfError(`打开失败：${(e as Error).message}`);
      }
    },
    [openParsedBook]
  );

  const handleShelfDelete = useCallback(async (id: string) => {
    if (shelfBusyRef.current) return;
    shelfBusyRef.current = true;
    setShelfBusy(true);
    try {
      await getShelfStore().deleteBook(id);
      setShelfEntries((prev) => prev.filter((e) => e.id !== id));
      if (currentShelfId === id) setCurrentShelfId(null);
      setShelfError(null);
    } catch (e) {
      setShelfError(`删除失败：${String(e)}`);
    } finally {
      shelfBusyRef.current = false;
      setShelfBusy(false);
    }
  }, [currentShelfId]);

  const handleShelfDeleteMany = useCallback(async (ids: string[]) => {
    if (shelfBusyRef.current || ids.length === 0) return;
    shelfBusyRef.current = true;
    setShelfBusy(true);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await getShelfStore().deleteBook(id);
        if (currentShelfId === id) setCurrentShelfId(null);
      } catch (e) {
        failed.push(String(e));
      }
    }
    setShelfEntries((prev) => prev.filter((e) => !ids.includes(e.id)));
    if (failed.length === 0) {
      setShelfError(null);
      setShelfNotice({ kind: "ok", text: `已删除 ${ids.length} 本` });
    } else {
      setShelfError(`删除失败 ${failed.length} 本：${failed.join("；")}`);
    }
    shelfBusyRef.current = false;
    setShelfBusy(false);
  }, [currentShelfId]);

  // ---- 章节状态回调（稳定引用；负责恢复页码） ----
  const onPageState = useCallback((s: ChapterState) => {
    chapterStateRef.current = s;
    setChapterState(s);
    if (s.status === "ready" && initialPagePendingRef.current) {
      initialPagePendingRef.current = false;
      const page = initialPageRef.current;
      // Content anchors are more precise than page numbers. Page is only a
      // fallback for legacy progress without an anchor.
      if (page > 0 && !lastStablePositionRef.current.anchor) {
        readerRef.current?.setPage(page);
      }
    }
  }, []);

  const handleReaderDisplayReady = useCallback(() => {
    navigationPendingRef.current = false;
    historyCaptureAllowedRef.current = true;
    setReaderDisplayReady(true);
    const state = chapterStateRef.current;
    const readingAnchor = readerRef.current?.getReadingAnchor();
    if (state.status === "ready" && !state.empty) {
      lastStablePositionRef.current = {
        spineIndex,
        page: state.currentPage,
        anchor:
          readingAnchor && readingAnchor.index >= 0
            ? { index: readingAnchor.index, ratio: readingAnchor.ratio }
            : null,
      };
    }
    // Display-ready flips a state gate; the following render runs the normal
    // progress effect with the newest derived percentage and anchor.
  }, [spineIndex]);

  const handleRequestChapter = useCallback(
    (index: number, opts?: { atEnd?: boolean }) => {
      navigationPendingRef.current = true;
      historyCaptureAllowedRef.current = false;
      setReaderDisplayReady(false);
      setSpineIndex(index);
      setAnchor(undefined);
      // 对象每次请求都新建：连续回翻多次时每次都能触发 atEnd 武装
      setStartAtEnd((prev) => ({ nonce: prev.nonce + 1, atEnd: opts?.atEnd === true }));
      setFootnote(null);
    },
    []
  );

  const handleIssues = useCallback((issues: string[]) => {
    if (issues.length > 0) setRuntimeIssues((prev) => [...prev, ...issues]);
  }, []);

  const handleToggleLog = useCallback(() => {
    setLogOpen((v) => {
      const next = !v;
      if (next) setDiagText(readerRef.current?.diagnose() ?? "（阅读器未初始化）");
      return next;
    });
  }, []);

  const handleFootnoteClose = useCallback(() => {
    setFootnote(null);
    readerRef.current?.dismissFootnote();
  }, []);

  const handleFootnoteAnchor = useCallback((anchor: string) => {
    readerRef.current?.jumpToAnchor(anchor);
    handleFootnoteClose();
  }, [handleFootnoteClose]);

  // ---- 目录/书内链接跳转 ----
  /** 当前稳定阅读位置；同步 ref 避免 ready 更新尚未完成 React render 的竞态。 */
  const currentReaderPosition = useCallback((): ReaderHistoryPosition => {
    const state = chapterStateRef.current;
    const readingAnchor = readerRef.current?.getReadingAnchor();
    return {
      spineIndex,
      page: state.status === "ready" ? state.currentPage : lastStablePositionRef.current.page,
      anchor:
        readingAnchor && readingAnchor.index >= 0
          ? { index: readingAnchor.index, ratio: readingAnchor.ratio }
          : lastStablePositionRef.current.anchor,
    };
  }, [spineIndex]);

  /** 捕获当前位置供一次普通书内跳转撤销；调用方负责保证一次点击只调用一次。 */
  const captureReaderHistory = useCallback((href: string): void => {
    const state = chapterStateRef.current;
    if (!book || view !== "reader" || !historyCaptureAllowedRef.current) return;
    if (state.status === "ready" && state.empty) return;
    // 跨章链接必须确实命中 spine；纯 fragment 则必须属于当前有效章节。
    // 这样 paginator 的通用 before 通知不会把无效 href 变成假历史。
    if (
      isFragmentOnly(href)
        ? spineIndex < 0 || spineIndex >= book.spine.length
        : spineIndexForPath(book, href) < 0
    ) {
      return;
    }
    const snapshot =
      !navigationPendingRef.current && state.status === "ready"
        ? currentReaderPosition()
        : {
            spineIndex: lastStablePositionRef.current.spineIndex,
            page: lastStablePositionRef.current.page,
            anchor: lastStablePositionRef.current.anchor
              ? { ...lastStablePositionRef.current.anchor }
              : null,
          };
    lastStablePositionRef.current = snapshot;
    historyCaptureAllowedRef.current = false;
    setReaderHistory((prev) => recordReaderNavigation(prev, snapshot));
  }, [book, view, spineIndex, currentReaderPosition]);

  /** 只执行 href 跳转，不记录历史；UI 入口和 paginator 通知入口共用。 */
  const navigateReaderHref = useCallback((href: string): void => {
    if (!book) return;
    const idx = spineIndexForPath(book, href);
    const { anchor: a } = splitHref(href);
    if (idx >= 0) {
      navigationPendingRef.current = true;
      historyCaptureAllowedRef.current = false;
      setReaderDisplayReady(false);
      setBookmarkMenuOpen(false);
      setSpineIndex(idx);
      setAnchor(a || undefined);
      setAnchorNonce((n) => n + 1);
      // 保持目录展开：方便连续选择章节；用 ✕/遮罩/Esc 关闭
    }
  }, [book]);

  /** 侧边目录入口：先记录一次，再执行跳转。 */
  const handleTocNavigate = useCallback((href: string): void => {
    if (!book) return;
    if (spineIndexForPath(book, href) < 0) return;
    captureReaderHistory(href);
    navigateReaderHref(href);
  }, [book, captureReaderHistory, navigateReaderHref]);

  /** iframe 普通书内链接：历史由 paginator 的 before 通知记录一次。 */
  const handleInternalNavigate = useCallback((href: string): void => {
    navigateReaderHref(href);
  }, [navigateReaderHref]);

  const handleHistoryBack = useCallback(() => {
    const current = currentReaderPosition();
    const transition = readerHistoryBack(readerHistory, current);
    if (!transition.target) return;
    lastStablePositionRef.current = transition.target;
    navigationPendingRef.current = true;
    historyCaptureAllowedRef.current = false;
    setReaderDisplayReady(false);
    setReaderHistory(transition.history);
    const pos = transition.target;
    // 恢复跳转前位置：章节 + 页码 + 内容锚点
    setSpineIndex(pos.spineIndex);
    setAnchor(undefined);
    setAnchorNonce((n) => n + 1);
    initialPagePendingRef.current = true;
    initialPageRef.current = pos.page ?? 0;
    setInitialAnchor(pos.anchor ?? null);
    setFootnote(null);
    setTocOpen(false);
    setMenuOpen(false);
  }, [readerHistory, currentReaderPosition]);

  const handleHistoryForward = useCallback(() => {
    const current = currentReaderPosition();
    const transition = readerHistoryForward(readerHistory, current);
    if (!transition.target) return;
    lastStablePositionRef.current = transition.target;
    navigationPendingRef.current = true;
    historyCaptureAllowedRef.current = false;
    setReaderDisplayReady(false);
    setReaderHistory(transition.history);
    const pos = transition.target;
    setSpineIndex(pos.spineIndex);
    setAnchor(undefined);
    setAnchorNonce((n) => n + 1);
    initialPagePendingRef.current = true;
    initialPageRef.current = pos.page;
    setInitialAnchor(pos.anchor);
    setFootnote(null);
    setTocOpen(false);
    setMenuOpen(false);
  }, [readerHistory, currentReaderPosition]);

  // ---- 书签 ----
  const currentBookmarks = currentShelfId
    ? (shelfEntries.find((entry) => entry.id === currentShelfId)?.bookmarks ?? [])
    : [];
  const isCurrentPageBookmarked =
    chapterState.status === "ready" &&
    currentBookmarks.some(
      (bookmark) =>
        bookmark.spineIndex === spineIndex && bookmark.page === chapterState.currentPage
    );
  // 书签按书中实际顺序排列，并补上章节标题供右下角展示
  const sortedBookmarks = book
    ? [...currentBookmarks]
        .sort(
          (a, b) =>
            a.spineIndex - b.spineIndex ||
            a.page - b.page ||
            (a.anchorIndex ?? 0) - (b.anchorIndex ?? 0)
        )
        .map((bookmark) => ({
          ...bookmark,
          chapterLabel: chapterLabelForIndex(book, bookmark.spineIndex),
        }))
    : [];

  const handleToggleBookmark = useCallback(() => {
    if (!currentShelfId || chapterState.status !== "ready") return;
    const existing = currentBookmarks.find(
      (bookmark) =>
        bookmark.spineIndex === spineIndex && bookmark.page === chapterState.currentPage
    );
    let next: Bookmark[];
    if (existing) {
      next = currentBookmarks.filter((bookmark) => bookmark.id !== existing.id);
    } else {
      const anchor = readerRef.current?.getReadingAnchor();
      const text = readerRef.current?.getAnchorText() ?? "";
      next = [
        ...currentBookmarks,
        {
          id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          spineIndex,
          page: chapterState.currentPage,
          anchorIndex: anchor?.index ?? null,
          anchorRatio: anchor?.ratio ?? null,
          text: text.slice(0, 80),
          createdAtMs: Date.now(),
        },
      ];
    }
    // 乐观更新 UI，再落盘
    setShelfEntries((prev) =>
      prev.map((entry) => (entry.id === currentShelfId ? { ...entry, bookmarks: next } : entry))
    );
    void getShelfStore()
      .setBookmarks(currentShelfId, next)
      .then(() =>
        setShelfEntries((prev) =>
          // 后端返回的是写入时刻的完整记录；期间用户可能已经翻页，
          // 因此这里只确认书签字段，不能用旧快照覆盖乐观进度。
          prev.map((entry) =>
            entry.id === currentShelfId ? { ...entry, bookmarks: next } : entry
          )
        )
      )
      .catch((error) => setShelfError(`书签保存失败：${String(error)}`));
  }, [currentShelfId, currentBookmarks, spineIndex, chapterState]);

  const handleSelectBookmark = useCallback(
    (bookmarkId: string) => {
      const bookmark = currentBookmarks.find((item) => item.id === bookmarkId);
      if (!bookmark || !book) return;
      captureReaderHistory(spineItemPath(book, spineIndex) ?? "");
      navigationPendingRef.current = true;
      historyCaptureAllowedRef.current = false;
      setReaderDisplayReady(false);
      setSpineIndex(bookmark.spineIndex);
      setAnchor(undefined);
      setAnchorNonce((n) => n + 1);
      initialPagePendingRef.current = true;
      initialPageRef.current = bookmark.page ?? 0;
      setInitialAnchor(
        bookmark.anchorIndex !== null && bookmark.anchorIndex !== undefined
          ? { index: bookmark.anchorIndex, ratio: bookmark.anchorRatio ?? 0 }
          : null
      );
      setBookmarkMenuOpen(false);
      setFootnote(null);
      setTocOpen(false);
      setMenuOpen(false);
    },
    [currentBookmarks, spineIndex, book, captureReaderHistory]
  );

  // ---- 外部链接：Tauri 用系统默认浏览器，浏览器开发模式开新标签页 ----
  const handleExternalLink = useCallback((rawUrl: string): void => {
    const url = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    if (!/^(https?|mailto|tel):/i.test(url)) return;
    if (isTauriEnv()) {
      void openUrl(url).catch((err: unknown) => {
        setRuntimeIssues((prev) => [...prev, `打开外部链接失败：${String(err)}`]);
      });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  // ---- 阅读进度保存 ----
  useEffect(() => {
    if (phase.phase !== "ready" || !book) return;
    if (
      readerDisplayReady &&
      !navigationPendingRef.current &&
      chapterState.status === "ready" &&
      !chapterState.empty
    ) {
      writeProgress(bookKey, {
        spineIndex,
        page: chapterState.currentPage,
        anchor: readerRef.current?.getReadingAnchor() ?? null,
      });
    }
  }, [phase, book, bookKey, spineIndex, chapterState, readerDisplayReady]);

  // ---- 设置持久化 ----
  useEffect(() => {
    writeSavedSettings({
      fontSizePx: settings.fontSizePx,
      theme: settings.theme,
      uiScale,
      lineHeight: settings.lineHeight,
      fontWeight: settings.fontWeight,
      letterSpacingPx: settings.letterSpacingPx,
      wordSpacingPx: settings.wordSpacingPx,
      customFontName: settings.customFontName,
      customCss: settings.customCss,
    });
  }, [
    settings.fontSizePx,
    settings.theme,
    settings.lineHeight,
    settings.fontWeight,
    settings.letterSpacingPx,
    settings.wordSpacingPx,
    settings.customFontName,
    settings.customCss,
    uiScale,
  ]);

  const changeTheme = (theme: Theme): void => {
    setSettings((s) => ({ ...s, theme }));
  };

  const resetDefaults = (): void => {
    setSettings({ ...DEFAULT_SETTINGS });
    setUiScale(1);
  };

  const adjustFont = (delta: number): void => {
    setSettings((s) => ({ ...s, fontSizePx: clamp(s.fontSizePx + delta, 12, 32) }));
  };

  // 排版属性步进（undefined=自动跟随书，循环切换）
  const LINE_HEIGHTS: Array<number | undefined> = [undefined, 1.4, 1.6, 1.8, 2.0, 2.2];
  const FONT_WEIGHTS: Array<number | undefined> = [undefined, 300, 400, 500, 600, 700];
  const SPACINGS: Array<number | undefined> = [undefined, 2, 4, 6, 8];
  const WORD_SPACINGS: Array<number | undefined> = [undefined, 4, 8, 12, 16];
  const stepValue = (
    list: Array<number | undefined>,
    cur: number | undefined,
    dir: 1 | -1
  ): number | undefined => {
    const idx = list.indexOf(cur);
    return list[(idx + dir + list.length) % list.length];
  };
  const adjustLineHeight = (dir: 1 | -1): void =>
    setSettings((s2) => ({ ...s2, lineHeight: stepValue(LINE_HEIGHTS, s2.lineHeight, dir) }));
  const adjustWeight = (dir: 1 | -1): void =>
    setSettings((s2) => ({ ...s2, fontWeight: stepValue(FONT_WEIGHTS, s2.fontWeight, dir) }));
  const adjustLetterSpacing = (dir: 1 | -1): void =>
    setSettings((s2) => ({
      ...s2,
      letterSpacingPx: stepValue(SPACINGS, s2.letterSpacingPx, dir),
    }));
  const adjustWordSpacing = (dir: 1 | -1): void =>
    setSettings((s2) => ({
      ...s2,
      wordSpacingPx: stepValue(WORD_SPACINGS, s2.wordSpacingPx, dir),
    }));

  // ---- 脚注弹层随重排重定位 ----
  useEffect(() => {
    if (!footnote) return;
    const r = readerRef.current?.getFootnoteMarkerRect();
    if (r) {
      setFootnote((f) => (f ? { ...f, rect: r } : f));
    } else {
      setFootnote(null); // 文档被替换（字号变化等）：关闭弹层
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterState, uiScale]);

  // ---- 状态栏时钟（时:分） ----
  // 书架不显示时钟；在这里继续每秒 setState 会让 100+ 书籍卡片无意义地
  // 参与整棵 App 的 React 重渲染。进入阅读界面时再启动并立即校时。
  useEffect(() => {
    if (view !== "reader") return;
    setClock(new Date());
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, [view]);

  const clockText = `${String(clock.getHours()).padStart(2, "0")}:${String(
    clock.getMinutes()
  ).padStart(2, "0")}`;

  // ---- 键盘翻页 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "Escape") {
        setMenuOpen(false);
        setTocOpen(false);
        handleFootnoteClose();
        return;
      }
      // 指针位于交互式浮层（脚注弹窗等）上时不翻页，滚轮/按钮交给浮层自身处理
      if (overlayHoverRef.current) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        readerRef.current?.nextPage();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        readerRef.current?.prevPage();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleFootnoteClose]);

  // ---- 拖拽打开 ----
  // Tauri 环境：打包后 WebView2 会拦截原生拖放，HTML5 drop 事件不会触发，
  // 必须走 Tauri 原生 onDragDropEvent：只把文件路径交给 Rust 链接书库流式导入，WebView 不预读正文。
  // 纯浏览器环境：用 HTML5 事件兜底。
  useEffect(() => {
    if (!isTauriEnv()) {
      const prevent = (e: DragEvent): void => e.preventDefault();
      const drop = (e: DragEvent): void => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
          f.name.toLowerCase().endsWith(".epub")
        );
        if (files.length > 0) {
          void handleImportSources(files.map((file) => ({ kind: "file" as const, file })));
        }
      };
      window.addEventListener("dragover", prevent);
      window.addEventListener("drop", drop);
      return () => {
        window.removeEventListener("dragover", prevent);
        window.removeEventListener("drop", drop);
      };
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter") {
          setDragActive(true);
        } else if (p.type === "leave") {
          setDragActive(false);
        } else if (p.type === "drop") {
          setDragActive(false);
          const paths = p.paths.filter((x) => x.toLowerCase().endsWith(".epub"));
          if (paths.length === 0) return;
          void handleImportSources(
            paths.map((path) => ({
              kind: "path" as const,
              path,
              name: path.split(/[\\/]/).pop() || "book.epub",
            }))
          );
        }
      })
      .then((u) => {
        if (!cancelled) unlisten = u;
      })
      .catch(() => {
        /* 非 Tauri 运行时忽略 */
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleImportSources]);

  // ---- 派生 ----
  const ready = phase.phase === "ready" && book !== null && server !== null;
  const reading = chapterState.status === "ready" && !chapterState.empty;
  const currentPath = ready ? spineItemPath(book!, spineIndex) : undefined;
  // 阅读进度：以"标准页 = 1000 字"为尺度，按锚点所在字数位置推算
  // （标题页等短章节只占零点几个百分点，长章节按字数占大头）
  const linearIndices = book
    ? book.spine.map((item, i) => (item.linear ? i : -1)).filter((i) => i >= 0)
    : [];
  const linearPos = linearIndices.indexOf(spineIndex);
  const linearCount = linearIndices.length;
  const totalBookChars = chapterChars.reduce((a, b) => a + b, 0);
  const charsBefore =
    chapterChars.length > 0
      ? linearIndices
          .slice(0, linearPos)
          .reduce((acc, i) => acc + (chapterChars[i] ?? 0), 0)
      : 0;
  const anchorChars = (() => {
    if (!reading) return 0;
    const a = readerRef.current?.getReadingAnchor();
    if (a && a.charsRead > 0) return a.charsRead;
    // 兜底：按页数比例估算本章已读字数
    if (chapterState.pageCount > 0) {
      return ((chapterState.currentPage + 1) / chapterState.pageCount) *
        (chapterChars[spineIndex] ?? 0);
    }
    return 0;
  })();
  // 标准页口径：固定 1000 字/页，进度 = 已读标准页 / 全书标准页
  const stdPagesRead = (charsBefore + anchorChars) / STANDARD_PAGE_CHARS;
  const stdPagesTotal = totalBookChars / STANDARD_PAGE_CHARS;
  const progressPct =
    reading && stdPagesTotal > 0
      ? Math.min(100, Math.round((stdPagesRead / stdPagesTotal) * 100))
      : 0;

  // ---- 书架进度回写（阅读器状态→书架索引，不修改阅读器本体） ----
  const persistShelfProgress = useCallback(() => {
    const state = chapterStateRef.current;
    if (
      navigationPendingRef.current ||
      !readerDisplayReady ||
      view !== "reader" ||
      !currentShelfId ||
      state.status !== "ready"
    ) return;
    const a = readerRef.current?.getReadingAnchor();
    const patch: ShelfProgressPatch = {
      lastReadAtMs: Date.now(),
      spineIndex,
      page: state.currentPage,
      progressPct,
      anchorIndex: a?.index ?? null,
      anchorRatio: a?.ratio ?? null,
    };
    // 先更新内存态：即使用户立刻返回并重新打开，也不会读到旧位置。
    setShelfEntries((prev) =>
      applyShelfProgressPatch(prev, currentShelfId, patch)
    );
    progressWriterRef.current?.enqueue(currentShelfId, patch);
  // page/anchor 变化必须触发写入；不能只依赖取整后的 progressPct，
  // 否则长书连续数页保持同一百分比时会漏掉最新位置。
  }, [view, currentShelfId, spineIndex, progressPct, readerDisplayReady, chapterState]);
  persistShelfProgressRef.current = persistShelfProgress;

  useEffect(() => {
    persistShelfProgress();
  }, [persistShelfProgress]);

  const handleBackToShelf = useCallback(async () => {
    persistShelfProgress();
    shelfBusyRef.current = true;
    setShelfBusy(true);
    try {
      await progressWriterRef.current?.flush();
    } catch (error) {
      setShelfError(`阅读进度保存失败：${String(error)}`);
    }
    setFootnote(null);
    setTocOpen(false);
    setMenuOpen(false);
    setBookmarkMenuOpen(false);
    setLogOpen(false);
    setDiagText(null);
    setView("shelf");
    shelfBusyRef.current = false;
    setShelfBusy(false);
  }, [persistShelfProgress]);

  // 切到后台时尽快冲刷；Tauri 关闭窗口时等待最后位置落盘后再销毁窗口。
  useEffect(() => {
    const flushWhenHidden = (): void => {
      if (document.visibilityState !== "hidden") return;
      persistShelfProgressRef.current();
      void progressWriterRef.current?.flush().catch(() => {
        /* 后台切换不打断阅读；返回书架或关闭时会再次报告。 */
      });
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    if (!isTauriEnv()) {
      return () => document.removeEventListener("visibilitychange", flushWhenHidden);
    }

    let unlisten: (() => void) | undefined;
    let closing = false;
    const appWindow = getCurrentWindow();
    void appWindow
      .onCloseRequested(async (event) => {
        if (closing) return;
        event.preventDefault();
        closing = true;
        persistShelfProgressRef.current();
        try {
          await progressWriterRef.current?.flush();
          await appWindow.destroy();
        } catch (error) {
          closing = false;
          setShelfNotice({ kind: "error", text: `阅读进度保存失败：${String(error)}` });
        }
      })
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {
        /* 非桌面窗口或关闭监听不可用时，仍保留逐页写入与 visibility flush。 */
      });
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      unlisten?.();
    };
  }, []);

  const currentChapterLabel = (() => {
    if (!ready || !currentPath) return "";
    const { path } = splitHref(currentPath);
    const walk = (nodes: import("./core/types").TocNode[]): string => {
      for (const n of nodes) {
        if (splitHref(n.href).path === path && n.label) return n.label;
        const c = walk(n.children);
        if (c) return c;
      }
      return "";
    };
    return walk(book!.toc);
  })();

  const renderUserFonts = useMemo(
    () =>
      userFonts
        .filter((f) => fontUrls[f.id])
        .map((f) => ({ family: f.family, url: fontUrls[f.id] })),
    [userFonts, fontUrls]
  );

  const logItems: LogItem[] = [
    ...(book?.issues ?? []).map((i) => ({ kind: i.kind, source: i.source, message: i.message })),
    ...runtimeIssues.map((m) => ({ kind: "reader_error", source: "render", message: m })),
  ];

  return (
    <div
      className={`app${dragActive ? " drag-active" : ""}`}
      data-theme={settings.theme === "dark" ? "dark" : settings.theme === "sepia" ? "sepia" : undefined}
      style={{ "--ui-scale": uiScale } as CSSProperties}
    >
      <Toolbar
        title={view === "reader" && ready ? book!.metadata.title : "EPUB 阅读器"}
        issueCount={logItems.length}
        onBackToShelf={view === "reader" ? handleBackToShelf : undefined}
        onHistoryBack={view === "reader" ? handleHistoryBack : undefined}
        canHistoryBack={readerHistory.back.length > 0 && readerDisplayReady && !navigationPendingRef.current}
        onHistoryForward={view === "reader" ? handleHistoryForward : undefined}
        canHistoryForward={readerHistory.forward.length > 0 && readerDisplayReady && !navigationPendingRef.current}
        onToggleBookmark={view === "reader" ? handleToggleBookmark : undefined}
        isBookmarked={view === "reader" && isCurrentPageBookmarked}
        onOpenBookmarks={view === "reader" ? () => setBookmarkMenuOpen(true) : undefined}
        onCloseBookmarks={() => setBookmarkMenuOpen(false)}
        bookmarkMenuOpen={view === "reader" && bookmarkMenuOpen}
        bookmarks={view === "reader" ? sortedBookmarks : []}
        onSelectBookmark={handleSelectBookmark}
        onOpenToc={
          view === "reader"
            ? () => {
                setTocOpen(true);
                setMenuOpen(false);
              }
            : undefined
        }
        onToggleMenu={view === "reader" ? () => setMenuOpen((v) => !v) : undefined}
        onToggleLog={view === "reader" ? handleToggleLog : undefined}
      />
      <div className="main">
        {view === "shelf" ? (
          <div className="shelf-stack">
            {shelfError && (
              <div className="shelf-error" role="alert">
                {shelfError}
              </div>
            )}
            <ShelfView
              entries={shelfEntries}
              busy={shelfBusy}
              theme={settings.theme}
              onThemeChange={changeTheme}
              onOpen={handleShelfOpen}
              onImport={() => void handleChooseBooks()}
              onDelete={handleShelfDelete}
              onDeleteMany={handleShelfDeleteMany}
              onExportArchive={() => void handleExportArchive()}
              onImportArchive={() => void handleImportArchive()}
              thumbnailProvider={shelfThumbnailProvider}
            />
          </div>
        ) : (
          <>
            {menuOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                <MenuPanel
                  fontSize={settings.fontSizePx}
                  uiScale={uiScale}
                  theme={settings.theme}
                  lineHeight={settings.lineHeight}
                  fontWeight={settings.fontWeight}
                  letterSpacingPx={settings.letterSpacingPx}
                  wordSpacingPx={settings.wordSpacingPx}
                  customFontName={settings.customFontName}
                  customCss={settings.customCss}
                  userFonts={userFonts}
                  fontBusy={fontBusy}
                  onImportFont={(file) => void handleImportFont(file)}
                  onDeleteFont={(id) => void handleDeleteFont(id)}
                  onCustomFontNameChange={(name) =>
                    setSettings((s2) => ({ ...s2, customFontName: name }))
                  }
                  onCustomCssChange={(css) =>
                    setSettings((s2) => ({ ...s2, customCss: css }))
                  }
                  onOpenFile={() => {
                    void handleChooseBooks();
                    setMenuOpen(false);
                  }}
                  onFontDec={() => adjustFont(-2)}
                  onFontInc={() => adjustFont(2)}
                  onFontSizeChange={(v) =>
                    setSettings((s2) => ({ ...s2, fontSizePx: clamp(v, 12, 32) }))
                  }
                  onLineHeightDec={() => adjustLineHeight(-1)}
                  onLineHeightInc={() => adjustLineHeight(1)}
                  onLineHeightChange={(v) => setSettings((s2) => ({ ...s2, lineHeight: v }))}
                  onWeightDec={() => adjustWeight(-1)}
                  onWeightInc={() => adjustWeight(1)}
                  onWeightChange={(v) => setSettings((s2) => ({ ...s2, fontWeight: v }))}
                  onLetterSpacingDec={() => adjustLetterSpacing(-1)}
                  onLetterSpacingInc={() => adjustLetterSpacing(1)}
                  onLetterSpacingChange={(v) =>
                    setSettings((s2) => ({ ...s2, letterSpacingPx: v }))
                  }
                  onWordSpacingDec={() => adjustWordSpacing(-1)}
                  onWordSpacingInc={() => adjustWordSpacing(1)}
                  onWordSpacingChange={(v) => setSettings((s2) => ({ ...s2, wordSpacingPx: v }))}
                  onUiScaleChange={(v) => setUiScale(clamp(v, 0.75, 1.5))}
                  onThemeChange={changeTheme}
                  onResetDefaults={resetDefaults}
                  onClose={() => setMenuOpen(false)}
                />
              </>
            )}
            {ready ? (
              <>
                {tocOpen && (
                  <>
                    <div className="toc-backdrop" onClick={() => setTocOpen(false)} />
                    <TocPanel
                      toc={book!.toc}
                      activePath={currentPath}
                      onNavigate={handleTocNavigate}
                      onClose={() => setTocOpen(false)}
                    />
                  </>
                )}
                <ReaderView
                  key={bookKey}
                  ref={readerRef}
                  book={book!}
                  server={server!}
                  spineIndex={spineIndex}
                  anchor={anchor}
                  anchorNonce={anchorNonce}
                  settings={settings}
                  userFonts={renderUserFonts}
                  onPageState={onPageState}
                  onDisplayReady={handleReaderDisplayReady}
                  onRequestChapter={handleRequestChapter}
                  onIssues={handleIssues}
                  onInternalLink={handleInternalNavigate}
                  onBeforeInternalNavigate={captureReaderHistory}
                  onInternalNavigationSettled={handleReaderDisplayReady}
                  onExternalLink={handleExternalLink}
                  onFootnote={(payload) => setFootnote(payload)}
                  onFootnoteClose={handleFootnoteClose}
                  initialAnchor={initialAnchor}
                  startAtEnd={startAtEnd}
                />
              </>
            ) : (
              <div className={`placeholder ${phase.phase === "error" ? "error" : ""}`}>
                {phase.phase === "idle" && <div className="big">正在准备书架…</div>}
                {phase.phase === "loading" && <div>正在打开《{phase.fileName}》…</div>}
                {phase.phase === "error" && (
                  <>
                    <div className="big">无法打开</div>
                    <div>{phase.message}</div>
                    <button onClick={() => void handleChooseBooks()}>重新选择文件</button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {view === "reader" && ready && (
        <div className="status-bar">
          <span className="sb-clock">{clockText}</span>
          <span className="sb-title" title={currentChapterLabel}>
            {currentChapterLabel || book!.metadata.title}
          </span>
          <span className="sb-progress">
            {reading
              ? `第 ${chapterState.currentPage + 1}/${chapterState.pageCount} 页 · 章 ${linearPos + 1}/${linearCount} · ${progressPct}%`
              : "加载中…"}
          </span>
        </div>
      )}
      {footnote && (
        <FootnotePop
          text={footnote.text}
          html={footnote.html}
          pinned={footnote.pinned}
          rect={footnote.rect}
          onClose={handleFootnoteClose}
          onExternalLink={handleExternalLink}
          onAnchor={handleFootnoteAnchor}
          onHoverChange={(over) => {
            overlayHoverRef.current = over;
          }}
        />
      )}
      {logOpen && (
        <LogPanel
          items={logItems}
          diagText={diagText}
          onClose={() => {
            setLogOpen(false);
            setDiagText(null);
          }}
        />
      )}
      {shelfNotice && (
        <div
          className={`shelf-toast ${shelfNotice.kind}${shelfNoticeFading ? " fading" : ""}`}
          role="status"
        >
          {shelfNotice.text}
        </div>
      )}
      {shelfBusy && (
        <div className="app-busy" aria-busy="true">
          <div className="app-busy-spinner" />
          <div className="app-busy-text">正在处理…</div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) {
            void handleImportSources(files.map((file) => ({ kind: "file" as const, file })));
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
