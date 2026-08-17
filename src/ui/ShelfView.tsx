import { useEffect, useMemo, useRef, useState } from "react";
import type { Theme } from "../render/settings";
import {
  filterShelfEntries,
  formatShelfTime,
  getShelfStore,
  sortShelfEntries,
  type ShelfEntry,
  type ShelfSort,
} from "./shelf";

export type ShelfDensity = "comfortable" | "standard" | "compact";

export interface ShelfViewProps {
  entries: ShelfEntry[];
  /** 全局忙（导入/打开/删除中），书架禁用交互防止重复操作 */
  busy: boolean;
  theme: Theme;
  onThemeChange(theme: Theme): void;
  onOpen(id: string): void;
  onImport(): void;
  onDelete(id: string): void;
  /** 批量删除（选中多本时由确认弹窗调用） */
  onDeleteMany(ids: string[]): void;
}

function Cover({ entry }: { entry: ShelfEntry }) {
  const [url, setUrl] = useState<string | null>(null);
  const loadedFor = useRef<string>("");

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    loadedFor.current = entry.id;
    void getShelfStore()
      .readCover(entry.id)
      .then((bytes) => {
        if (cancelled || !bytes || bytes.byteLength === 0) return;
        const mime = entry.coverMime || "image/jpeg";
        objectUrl = URL.createObjectURL(
          new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime })
        );
        setUrl(objectUrl);
      })
      .catch(() => {
        /* 封面读取失败按无封面处理 */
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry.id, entry.coverMime]);

  if (!url) {
    return (
      <div className="shelf-cover fallback" aria-hidden="true">
        <span className="fallback-mark">{entry.title.trim().charAt(0) || "书"}</span>
        <span className="fallback-title">{entry.title}</span>
      </div>
    );
  }
  return <img className="shelf-cover" src={url} alt={entry.title} loading="lazy" />;
}

interface ShelfSelectOption {
  value: string;
  label: string;
}

function ShelfSelect(props: {
  value: string;
  options: ShelfSelectOption[];
  onChange(value: string): void;
  title?: string;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = props.options.find((o) => o.value === props.value) ?? props.options[0];

  return (
    <div className="shelf-select-wrap" ref={ref}>
      <button
        className={`shelf-select-btn${open ? " open" : ""}`}
        title={props.title}
        disabled={props.busy}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current.label}</span>
        <span className="shelf-select-arrow" aria-hidden="true" />
      </button>
      {open && (
        <div className="shelf-select-pop" role="listbox">
          {props.options.map((o) => (
            <button
              key={o.value}
              className={`shelf-select-option${o.value === props.value ? " selected" : ""}`}
              role="option"
              aria-selected={o.value === props.value}
              onClick={() => {
                props.onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
              {o.value === props.value ? <span className="shelf-select-check">✓</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShelfView(props: ShelfViewProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ShelfSort>("recent");
  const [density, setDensity] = useState<ShelfDensity>("standard");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<ShelfEntry[] | null>(null);
  const visible = useMemo(() => {
    const q = filterShelfEntries(props.entries, query);
    return sortShelfEntries(q, sort);
  }, [props.entries, query, sort]);

  const toggleSelected = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterSelection = (): void => {
    setSelectedIds(new Set());
    setSelectionMode(true);
  };

  const exitSelection = (): void => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const now = Date.now();

  return (
    <div
      className={`shelf-view density-${density}${selectionMode ? " selection-mode" : ""}${props.busy ? " busy" : ""}`}
      aria-busy={props.busy}
    >
      <header className="shelf-head">
        {selectionMode ? (
          <>
            <div className="shelf-title-block selection-title">
              <span className="shelf-title">已选 {selectedIds.size} 本</span>
            </div>
            <div className="shelf-controls selection-actions">
              <button
                className="shelf-select-all tb-btn"
                disabled={props.busy || visible.length === 0}
                onClick={() => {
                  if (selectedIds.size === visible.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(visible.map((e) => e.id)));
                }}
              >
                {selectedIds.size === visible.length ? "取消全选" : "全选"}
              </button>
              <button className="shelf-select-cancel tb-btn" onClick={exitSelection}>
                取消
              </button>
              <button
                className="shelf-select-delete tb-btn"
                disabled={selectedIds.size === 0 || props.busy}
                onClick={() => {
                  const targets = props.entries.filter((e) => selectedIds.has(e.id));
                  if (targets.length > 0) setDeleteTargets(targets);
                }}
              >
                🗑 确认删除{selectedIds.size > 0 ? `（${selectedIds.size}）` : ""}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="shelf-title-block">
              <span className="shelf-title">书架</span>
              <span className="shelf-count">{props.entries.length} 本</span>
            </div>
            <div className="shelf-controls">
              <input
                className="shelf-search"
                type="search"
                placeholder="搜索书名或作者"
                value={query}
                disabled={props.busy}
                onChange={(e) => setQuery(e.target.value)}
              />
              <ShelfSelect
                value={sort}
                busy={props.busy}
                title="排序方式"
                options={[
                  { value: "recent", label: "最近阅读" },
                  { value: "added", label: "最近添加" },
                  { value: "title", label: "书名" },
                ]}
                onChange={(v) => setSort(v as ShelfSort)}
              />
              <ShelfSelect
                value={density}
                busy={props.busy}
                title="排布密度"
                options={[
                  { value: "comfortable", label: "舒适" },
                  { value: "standard", label: "标准" },
                  { value: "compact", label: "紧凑" },
                ]}
                onChange={(v) => setDensity(v as ShelfDensity)}
              />
              <ShelfSelect
                value={props.theme}
                busy={props.busy}
                title="书架主题"
                options={[
                  { value: "light", label: "浅色" },
                  { value: "dark", label: "深色" },
                  { value: "sepia", label: "羊皮纸" },
                ]}
                onChange={(v) => props.onThemeChange(v as Theme)}
              />
              <button
                className="shelf-batch-btn tb-btn"
                onClick={enterSelection}
                disabled={props.busy || props.entries.length === 0}
                title="批量选择书籍"
              >
                🗑 批量删除
              </button>
              <button
                className="shelf-import tb-btn"
                onClick={props.onImport}
                disabled={props.busy}
                title="导入 EPUB 到书架"
              >
                ＋ 导入
              </button>
            </div>
          </>
        )}
      </header>

      {props.entries.length === 0 ? (
        <div className="shelf-empty">
          <div className="shelf-empty-mark">📚</div>
          <div className="shelf-empty-title">书架还是空的</div>
          <div className="shelf-empty-hint">
            导入 EPUB 后会出现在这里；点击“导入”或把文件拖进窗口
          </div>
          <button className="shelf-empty-btn" onClick={props.onImport} disabled={props.busy}>
            导入第一本书
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="shelf-empty">
          <div className="shelf-empty-title">没有匹配的书</div>
          <div className="shelf-empty-hint">换一个关键词试试</div>
        </div>
      ) : (
        <div className="shelf-grid">
          {visible.map((entry) => {
            const last = entry.lastReadAtMs > 0 ? entry.lastReadAtMs : entry.addedAtMs;
            const recent = now - entry.lastReadAtMs < 1000 * 60 * 60 * 24 * 7;
            return (
              <div
                key={entry.id}
                className={`shelf-card${selectedIds.has(entry.id) ? " selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (selectionMode) toggleSelected(entry.id);
                  else props.onOpen(entry.id);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (selectionMode) toggleSelected(entry.id);
                  else props.onOpen(entry.id);
                }}
                title={`${entry.title}${entry.creator ? ` · ${entry.creator}` : ""}`}
              >
                <div className="shelf-cover-box">
                  <Cover entry={entry} />
                  {selectionMode && (
                    <span className="shelf-select-mark">{selectedIds.has(entry.id) ? "✓" : ""}</span>
                  )}
                  {entry.progressPct > 0 && (
                    <div className="shelf-progress-wrap">
                      <div className="shelf-progress">
                        <div
                          className="shelf-progress-fill"
                          style={{ width: `${Math.min(100, entry.progressPct)}%` }}
                        />
                      </div>
                      <span className="shelf-progress-pct">{entry.progressPct}%</span>
                    </div>
                  )}
                  {recent && entry.progressPct > 0 && (
                    <span className="shelf-continue">继续阅读</span>
                  )}
                  {entry.isNew && !selectionMode && <span className="shelf-new">新</span>}
                  {!selectionMode && (
                    <span
                      className="shelf-delete"
                      title="从书架删除"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!props.busy) setDeleteTargets([entry]);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && !props.busy) {
                          e.stopPropagation();
                          if (!props.busy) setDeleteTargets([entry]);
                        }
                      }}
                    >
                      ✕
                    </span>
                  )}
                </div>
                <div className="shelf-card-title">{entry.title}</div>
                <div className="shelf-card-meta">
                  {entry.creator ? <span className="shelf-card-creator">{entry.creator}</span> : null}
                  <span className="shelf-card-time">
                    {formatShelfTime(last) || "刚刚"}
                    {entry.progressPct > 0 ? " · 读过" : " · 未读"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteTargets && (
        <div className="shelf-confirm-backdrop" onClick={() => setDeleteTargets(null)}>
          <div
            className="shelf-confirm"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shelf-confirm-title">
              {deleteTargets.length > 1
                ? `删除选中的 ${deleteTargets.length} 本？`
                : "从书架删除？"}
            </div>
            <div className="shelf-confirm-name">
              {deleteTargets.length > 1
                ? deleteTargets
                    .slice(0, 3)
                    .map((t) => t.title)
                    .join("、") + (deleteTargets.length > 3 ? "…" : "")
                : deleteTargets[0].title}
            </div>
            <div className="shelf-confirm-hint">不会删除原始文件；阅读进度也会一并移除。</div>
            <div className="shelf-confirm-actions">
              <button className="tb-btn" onClick={() => setDeleteTargets(null)}>
                取消
              </button>
              <button
                className="tb-btn danger"
                onClick={() => {
                  const ids = deleteTargets.map((t) => t.id);
                  setDeleteTargets(null);
                  if (selectionMode) {
                    // 批量选择模式：无论选 1 本还是多本，确认后都退出选择模式
                    if (ids.length > 1) props.onDeleteMany(ids);
                    else props.onDelete(ids[0]);
                    exitSelection();
                  } else {
                    props.onDelete(ids[0]);
                  }
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
