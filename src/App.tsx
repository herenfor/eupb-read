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
import type { ChapterState } from "./render/paginator";
import { Toolbar } from "./ui/Toolbar";
import { MenuPanel } from "./ui/MenuPanel";
import { FootnotePop } from "./ui/FootnotePop";
import { TocPanel } from "./ui/TocPanel";
import { LogPanel, type LogItem } from "./ui/LogPanel";
import { ReaderView, type ReaderHandle } from "./ui/ReaderView";
import {
  readProgress,
  writeProgress,
  readSavedSettings,
  writeSavedSettings,
} from "./ui/storage";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";

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
  const [footnote, setFootnote] = useState<{
    text: string;
    rect: { left: number; top: number; right: number; bottom: number };
  } | null>(null);
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

  const readerRef = useRef<ReaderHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialPagePendingRef = useRef(false);
  const initialPageRef = useRef(0);

  // ---- 打开文件 ----
  const handleOpenFile = useCallback(async (file: File) => {
    setPhase({ phase: "loading", fileName: file.name });
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const b = await loadBook(buf);
      if (b.spine.length === 0) {
        setPhase({ phase: "error", message: "书中没有可阅读的内容（spine 为空）" });
        return;
      }
      const srv = new ResourceServer(b);
      // 各线性章节有效字数（去标签、去空白），供标准页进度推算
      const stripTags = (t: string): string => t.replace(/<[^>]*>/g, "").replace(/\s/g, "");
      const chars: number[] = b.spine.map((item) => {
        if (!item.linear) return 0;
        const mi = b.manifest.get(item.idref);
        if (!mi) return 0;
        const p = resolvePath(b.opfPath, mi.href);
        const text = srv.textFor(p);
        return text ? stripTags(text).length : 0;
      });
      setChapterChars(chars);
      const key = bookKeyOf(b, file.name, file.size);
      const saved = readProgress(key);
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
      setPhase({ phase: "ready" });
    } catch (e) {
      setPhase({
        phase: "error",
        message:
          e instanceof DrmError ? e.message : `无法打开文件：${(e as Error).message}`,
      });
    }
  }, []);

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
  const FONT_WEIGHTS: Array<number | undefined> = [undefined, 400, 500, 700];
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
        setFootnote(null);
        return;
      }
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
  }, []);

  // ---- 拖拽打开 ----
  // Tauri 环境：打包后 WebView2 会拦截原生拖放，HTML5 drop 事件不会触发，
  // 必须走 Tauri 原生 onDragDropEvent（拿到的是文件路径，再经 read_epub_file 读字节）。
  // 纯浏览器环境：用 HTML5 事件兜底。
  useEffect(() => {
    if (!isTauriEnv()) {
      const prevent = (e: DragEvent): void => e.preventDefault();
      const drop = (e: DragEvent): void => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (f && f.name.toLowerCase().endsWith(".epub")) void handleOpenFile(f);
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
          const path = p.paths.find((x) => x.toLowerCase().endsWith(".epub"));
          if (!path) return;
          const name = path.split(/[\\/]/).pop() || "book.epub";
          invoke<ArrayBuffer>("read_epub_file", { path })
            .then((buf) => handleOpenFile(new File([buf], name)))
            .catch((err) => {
              setPhase({ phase: "error", message: `无法读取文件：${String(err)}` });
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
  }, [handleOpenFile]);

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
      data-theme={settings.theme === "dark" ? "dark" : undefined}
      style={{ "--ui-scale": uiScale } as CSSProperties}
    >
      <Toolbar
        title={ready ? book!.metadata.title : "EPUB 阅读器"}
        issueCount={logItems.length}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onToggleLog={handleToggleLog}
      />
      <div className="main">
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
              onFootnote={(t, r) => setFootnote({ text: t, rect: r })}
              onFootnoteClose={() => setFootnote(null)}
              initialAnchor={initialAnchor}
              startAtEnd={startAtEnd}
            />
          </>
        ) : (
          <div className={`placeholder ${phase.phase === "error" ? "error" : ""}`}>
            {phase.phase === "idle" && (
              <>
                <div className="big">EPUB 阅读器</div>
                <div className="drop-hint">
                  点击下方按钮选择 .epub 文件，或将文件直接拖入窗口
                </div>
                <button onClick={() => fileInputRef.current?.click()}>打开 EPUB 文件</button>
              </>
            )}
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
      </div>
      {ready && (
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
          rect={footnote.rect}
          onClose={() => setFootnote(null)}
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
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleOpenFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
