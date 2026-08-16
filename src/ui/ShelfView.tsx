import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterShelfEntries,
  formatShelfTime,
  getShelfStore,
  sortShelfEntries,
  type ShelfEntry,
  type ShelfSort,
} from "./shelf";

export interface ShelfViewProps {
  entries: ShelfEntry[];
  /** 全局忙（导入/打开/删除中），书架禁用交互防止重复操作 */
  busy: boolean;
  onOpen(id: string): void;
  onImport(): void;
  onDelete(id: string): void;
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

export function ShelfView(props: ShelfViewProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ShelfSort>("recent");
  const [deleteTarget, setDeleteTarget] = useState<ShelfEntry | null>(null);

  const visible = useMemo(() => {
    const q = filterShelfEntries(props.entries, query);
    return sortShelfEntries(q, sort);
  }, [props.entries, query, sort]);

  const now = Date.now();

  return (
    <div className={`shelf-view${props.busy ? " busy" : ""}`} aria-busy={props.busy}>
      <header className="shelf-head">
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
          <select
            className="shelf-sort"
            value={sort}
            disabled={props.busy}
            onChange={(e) => setSort(e.target.value as ShelfSort)}
            title="排序方式"
          >
            <option value="recent">最近阅读</option>
            <option value="added">最近添加</option>
            <option value="title">书名</option>
          </select>
          <button
            className="shelf-import tb-btn"
            onClick={props.onImport}
            disabled={props.busy}
            title="导入 EPUB 到书架"
          >
            ＋ 导入
          </button>
        </div>
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
                className="shelf-card"
                role="button"
                tabIndex={0}
                onClick={() => props.onOpen(entry.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !props.busy) props.onOpen(entry.id);
                }}
                title={`${entry.title}${entry.creator ? ` · ${entry.creator}` : ""}`}
              >
                <div className="shelf-cover-box">
                  <Cover entry={entry} />
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
                  {entry.isNew && <span className="shelf-new">新</span>}
                  <span
                    className="shelf-delete"
                    title="从书架删除"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!props.busy) setDeleteTarget(entry);
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !props.busy) {
                        e.stopPropagation();
                        props.onDelete(entry.id);
                      }
                    }}
                  >
                    ✕
                  </span>
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

      {deleteTarget && (
        <div className="shelf-confirm-backdrop" onClick={() => setDeleteTarget(null)}>
          <div
            className="shelf-confirm"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shelf-confirm-title">从书架删除？</div>
            <div className="shelf-confirm-name">{deleteTarget.title}</div>
            <div className="shelf-confirm-hint">不会删除原始文件；阅读进度也会一并移除。</div>
            <div className="shelf-confirm-actions">
              <button className="tb-btn" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button
                className="tb-btn danger"
                onClick={() => {
                  const id = deleteTarget.id;
                  setDeleteTarget(null);
                  props.onDelete(id);
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
