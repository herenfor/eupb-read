import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { loadBook, spineIndexForPath, spineItemPath, DrmError } from "./core/book";
import type { Book } from "./core/types";
import { resolvePath, splitHref } from "./core/paths";
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
  getShelfStore,
  shelfIdFor,
  type ShelfEntry,
  type ShelfProgressPatch,
} from "./ui/shelf";
import {
  readProgress,
  writeProgress,
  readSavedSettings,
  writeSavedSettings,
  type SavedProgress,
} from "./ui/storage";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type AppPhase =
  | { phase: "idle" }
  | { phase: "loading"; fileName: string }
  | { phase: "error"; message: string }
  | { phase: "ready" };

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
  /** 指针是否悬停在交互式浮层（脚注弹窗等）上：此时不响应翻页键/后续可扩展书签等 */
  const overlayHoverRef = useRef(false);

  const readerRef = useRef<ReaderHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialPagePendingRef = useRef(false);
  const initialPageRef = useRef(0);

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
      setSpineIndex(start);
      setAnchor(undefined);
      initialPagePendingRef.current = true;
      initialPageRef.current = saved?.page ?? 0;
      setInitialAnchor(saved?.anchor ?? null);
      setCurrentShelfId(shelfId);
      setView("reader");
      setPhase({ phase: "ready" });
    },
    []
  );

  // ---- 批量导入 EPUB 并入库（可读取才算导入成功；导入后停留在书架） ----
  const handleImportFiles = useCallback(async (files: File[]) => {
    const list = files.filter((f) => f.name.toLowerCase().endsWith(".epub"));
    if (list.length === 0 || shelfBusyRef.current) return;
    shelfBusyRef.current = true;
    setShelfBusy(true);
    setShelfNotice(null);
    const ok: string[] = [];
    const failed: string[] = [];
    for (const file of list) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const b = await loadBook(buf);
        if (b.spine.length === 0) {
          throw new Error("书中没有可阅读的内容（spine 为空）");
        }
        const id = shelfIdFor(b.metadata.identifier || "", file.name, file.size);
        const cover = b.coverHref ? b.resources.get(b.coverHref) : undefined;
        const savedEntry = await getShelfStore().save({
          entry: {
            id,
            title: b.metadata.title || file.name.replace(/\.epub$/i, ""),
            creator: b.metadata.creator ?? "",
            fileName: file.name,
            fileSize: file.size,
            coverMime: cover?.mediaType ?? "",
            addedAtMs: Date.now(),
          },
          bytes: buf,
          coverBytes: cover?.data,
          coverMime: cover?.mediaType,
        });
        setShelfEntries((prev) => [savedEntry, ...prev.filter((e) => e.id !== id)]);
        ok.push(savedEntry.title);
      } catch (e) {
        failed.push(
          `${file.name}：${e instanceof DrmError ? e.message : (e as Error).message}`
        );
      }
    }
    const okText = ok.length > 0 ? `已导入 ${ok.length} 本` : "";
    const failText = failed.length > 0 ? `；失败 ${failed.length} 本（${failed.join("；")}）` : "";
    setShelfNotice({
      kind: failed.length > 0 ? (ok.length > 0 ? "warn" : "error") : "ok",
      text: `${okText}${failText}` || "没有可导入的文件",
    });
    shelfBusyRef.current = false;
    setShelfBusy(false);
  }, []);

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
      const entry = shelfEntriesRef.current.find((e) => e.id === id);
      if (!entry) return;
      shelfBusyRef.current = true;
      setShelfBusy(true);
      setShelfError(null);
      setPhase({ phase: "loading", fileName: entry.fileName });
      try {
        const buf = await getShelfStore().readBook(id);
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
          setShelfEntries((prev) =>
            prev.map((e) => (e.id === id ? { ...e, isNew: false } : e))
          );
          void getShelfStore()
            .markOpened(id)
            .then((savedEntry) =>
              setShelfEntries((prev) => prev.map((e) => (e.id === id ? savedEntry : e)))
            )
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
    setChapterState(s);
    if (s.status === "ready" && initialPagePendingRef.current) {
      initialPagePendingRef.current = false;
      const page = initialPageRef.current;
      if (page > 0) readerRef.current?.setPage(page);
    }
  }, []);

  const handleRequestChapter = useCallback(
    (index: number, opts?: { atEnd?: boolean }) => {
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

  // ---- 目录跳转 ----
  const handleTocNavigate = (href: string): void => {
    if (!book) return;
    const idx = spineIndexForPath(book, href);
    const { anchor: a } = splitHref(href);
    if (idx >= 0) {
      setSpineIndex(idx);
      setAnchor(a || undefined);
      setAnchorNonce((n) => n + 1);
      // 保持目录展开：方便连续选择章节；用 ✕/遮罩/Esc 关闭
    }
  };

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
    if (chapterState.status === "ready" && !chapterState.empty) {
      writeProgress(bookKey, {
        spineIndex,
        page: chapterState.currentPage,
        anchor: readerRef.current?.getReadingAnchor() ?? null,
      });
    }
  }, [phase, book, bookKey, spineIndex, chapterState]);

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
    });
  }, [
    settings.fontSizePx,
    settings.theme,
    settings.lineHeight,
    settings.fontWeight,
    settings.letterSpacingPx,
    settings.wordSpacingPx,
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
  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

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
  // 必须走 Tauri 原生 onDragDropEvent（拿到的是文件路径，再经 read_epub_file 读字节）。
  // 纯浏览器环境：用 HTML5 事件兜底。
  useEffect(() => {
    if (!isTauriEnv()) {
      const prevent = (e: DragEvent): void => e.preventDefault();
      const drop = (e: DragEvent): void => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
          f.name.toLowerCase().endsWith(".epub")
        );
        if (files.length > 0) void handleImportFiles(files);
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
          Promise.all(
            paths.map(async (path) => {
              const buf = await invoke<ArrayBuffer>("read_epub_file", { path });
              const name = path.split(/[\\/]/).pop() || "book.epub";
              return new File([buf], name);
            })
          )
            .then((files) => handleImportFiles(files))
            .catch((err) => {
              setShelfError(`无法读取文件：${String(err)}`);
            });
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
  }, [handleImportFiles]);

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
    if (view !== "reader" || !currentShelfId || chapterState.status !== "ready") return;
    const a = readerRef.current?.getReadingAnchor();
    const patch: ShelfProgressPatch = {
      lastReadAtMs: Date.now(),
      spineIndex,
      page: chapterState.currentPage,
      progressPct,
      anchorIndex: a?.index ?? null,
      anchorRatio: a?.ratio ?? null,
    };
    void getShelfStore()
      .updateProgress(currentShelfId, patch)
      .then((entry) =>
        setShelfEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)))
      )
      .catch(() => {
        /* 进度回写失败不打断阅读 */
      });
  }, [view, currentShelfId, chapterState, spineIndex, progressPct]);

  useEffect(() => {
    persistShelfProgress();
  }, [persistShelfProgress]);

  const handleBackToShelf = useCallback(() => {
    persistShelfProgress();
    setFootnote(null);
    setTocOpen(false);
    setMenuOpen(false);
    setLogOpen(false);
    setDiagText(null);
    setView("shelf");
  }, [persistShelfProgress]);

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
              onOpen={(id) => void handleShelfOpen(id)}
              onImport={() => fileInputRef.current?.click()}
              onDelete={(id) => void handleShelfDelete(id)}
              onDeleteMany={(ids) => void handleShelfDeleteMany(ids)}
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
                  onOpenFile={() => {
                    fileInputRef.current?.click();
                    setMenuOpen(false);
                  }}
                  onOpenToc={() => {
                    setTocOpen(true);
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
                  onPageState={onPageState}
                  onRequestChapter={handleRequestChapter}
                  onIssues={handleIssues}
                  onInternalLink={handleTocNavigate}
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
                    <button onClick={() => fileInputRef.current?.click()}>重新选择文件</button>
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
          if (files.length > 0) void handleImportFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
