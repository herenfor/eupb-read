import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Book } from "../core/types";
import { nextLinearIndex, spineItemPath } from "../core/book";
import { ChapterPaginator, type ChapterState } from "../render/paginator";
import type { ResourceServer } from "../render/resources";
import type { ReaderSettings } from "../render/settings";

export interface ReaderHandle {
  nextPage(): void;
  prevPage(): void;
  setPage(i: number): void;
  /** 渲染诊断文本（浏览器内调试） */
  diagnose(): string;
  /** 当前阅读锚点（进度持久化） */
  getReadingAnchor(): { path: string; index: number; ratio: number } | null;
}

interface ReaderViewProps {
  book: Book;
  server: ResourceServer;
  spineIndex: number;
  /** 目录跳转的页内锚点（随章节切换一起更新） */
  anchor?: string;
  /** 锚点变更序号：同章节重复跳转时强制重载 */
  anchorNonce: number;
  settings: ReaderSettings;
  onPageState(s: ChapterState): void;
  /** 请求切换到相邻章节（next/prev 或空章自动前进） */
  onRequestChapter(index: number): void;
  onIssues(issues: string[]): void;
  /** 书内链接跳转（已解析为书内路径，含可选 #anchor） */
  onInternalLink(href: string): void;
  /** 打开书时恢复的阅读锚点（可选，页码之外的精确定位） */
  initialAnchor?: { index: number; ratio: number } | null;
}

function parseViewport(vp: string | undefined): { w: number; h: number } | null {
  if (!vp) return null;
  const m = /^(\d+)\s*[xX,]\s*(\d+)$/.exec(vp.trim());
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

export const ReaderView = forwardRef<ReaderHandle, ReaderViewProps>(function ReaderView(
  props,
  ref
) {
  const { book, server, spineIndex, settings } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const paginatorRef = useRef<ChapterPaginator | null>(null);
  const spineIndexRef = useRef(spineIndex);
  const autoAdvanceRef = useRef(false);

  spineIndexRef.current = spineIndex;

  // 固定版式：分栏间距为 0（每章整页显示）
  const effSettings: ReaderSettings =
    book.fixedLayout || settings.gapPx === 0
      ? { ...settings, gapPx: 0 }
      : settings;

  // 创建分页器（book/server 就绪后；App 端用 key 保证 book 变化时整体重建）
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const p = new ChapterPaginator(
      iframe,
      server,
      effSettings,
      book.version === 2,
      (s) => {
        props.onPageState(s);
        if (s.status !== "ready") return;
        // 空章节：自动前进到下一线性章
        if (s.empty && !autoAdvanceRef.current) {
          autoAdvanceRef.current = true;
          const next = nextLinearIndex(book, spineIndexRef.current, 1);
          if (next >= 0) props.onRequestChapter(next);
        }
      },
      (issues) => props.onIssues(issues),
      book.fixedLayout,
      (href) => props.onInternalLink(href),
      (dir) => turnPageRef.current(dir)
    );
    paginatorRef.current = p;
    return () => {
      p.dispose();
      paginatorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, server]);

  // 章节切换 → 加载
  const initialAnchorRef = useRef(props.initialAnchor ?? null);
  useEffect(() => {
    const p = paginatorRef.current;
    if (!p) return;
    autoAdvanceRef.current = false;
    const path = spineItemPath(book, spineIndex);
    if (!path) {
      props.onPageState({ status: "error", message: "章节资源缺失" });
      return;
    }
    void (async () => {
      await p.load(path, { anchor: props.anchor });
      // 打开书恢复阅读锚点：在 load 清空换章锚点之后、iframe 就绪之前设置
      if (initialAnchorRef.current) {
        p.setReadingAnchor({ path, ...initialAnchorRef.current });
        initialAnchorRef.current = null;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, spineIndex, props.anchorNonce]);

  // 设置变更 → 重载（阅读位置由分页器内容锚点保留；仅在实际变化时触发）
  const prevSettingsRef = useRef(effSettings);
  useEffect(() => {
    const p = paginatorRef.current;
    if (!p) return;
    if (prevSettingsRef.current === effSettings) return;
    prevSettingsRef.current = effSettings;
    void p.reloadWithSettings(effSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // 尺寸变化 → 重排（ResizeObserver 观察 iframe，rAF 防抖）。
  // 关键：缩放时不重新捕获锚点——ResizeObserver 回调时布局已是中间尺寸，
  // 此时取样会拿到动画中间状态。直接使用上一次稳定状态（翻页/上次重排）
  // 存下的锚点：它记录的正是缩放前正在读的内容，动画全程追踪同一段文字。
  useEffect(() => {
    const el = iframeRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => paginatorRef.current?.reflow());
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // 翻页逻辑（滚轮与按钮/键盘共用）
  const turnPageRef = useRef<(dir: 1 | -1) => void>(() => {});
  turnPageRef.current = (dir) => {
    const p = paginatorRef.current;
    if (!p) return;
    if (dir === 1) {
      if (p.currentPage < p.pageCount - 1) {
        p.setPage(p.currentPage + 1);
      } else {
        const next = nextLinearIndex(book, spineIndexRef.current, 1);
        if (next >= 0) props.onRequestChapter(next);
      }
    } else {
      if (p.currentPage > 0) {
        p.setPage(p.currentPage - 1);
      } else {
        const prev = nextLinearIndex(book, spineIndexRef.current, -1);
        if (prev >= 0) props.onRequestChapter(prev);
      }
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      nextPage() {
        turnPageRef.current(1);
      },
      prevPage() {
        turnPageRef.current(-1);
      },
      setPage(i: number) {
        paginatorRef.current?.setPage(i);
      },
      diagnose() {
        return paginatorRef.current?.diagnose() ?? "（阅读器未初始化）";
      },
      getReadingAnchor() {
        return paginatorRef.current?.getReadingAnchor() ?? null;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book]
  );

  // 固定版式：按 viewport 设置宽高比
  const vp = parseViewport(book.viewport);

  return (
    <div
      className="reader"
      style={
        book.fixedLayout && vp
          ? {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 12,
            }
          : undefined
      }
    >
      <iframe
        ref={iframeRef}
        title="chapter"
        style={
          book.fixedLayout && vp
            ? {
                position: "relative",
                inset: "auto",
                width: "auto",
                height: "auto",
                aspectRatio: `${vp.w} / ${vp.h}`,
                maxWidth: "100%",
                maxHeight: "100%",
              }
            : undefined
        }
      />
    </div>
  );
});
