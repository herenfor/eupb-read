import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

export type SearchStatus = "idle" | "searching" | "complete" | "error";

export interface SearchMatchRange {
  /** UTF-16 offsets relative to the displayed snippet. */
  start: number;
  end: number;
}

export interface SearchTextSegment {
  text: string;
  highlighted: boolean;
}

export interface SearchPanelResult {
  id: string;
  chapterTitle: string;
  chapterPath?: string;
  snippet: string;
  /** Optional display ranges; callers may provide highlightedSnippet instead. */
  matchRanges?: SearchMatchRange[];
  highlightedSnippet?: SearchTextSegment[];
}

export interface SearchPanelProps {
  query: string;
  onQueryChange(query: string): void;
  results: SearchPanelResult[];
  status: SearchStatus;
  processed: number;
  total: number;
  truncated?: boolean;
  errorMessage?: string;
  onSelect(result: SearchPanelResult): void;
  onClose(): void;
  onCancel?(): void;
  navigationBusy?: boolean;
}

/** Keep a large result set from creating an equally large DOM tree. */
export const SEARCH_RESULT_RENDER_LIMIT = 100;

export function limitSearchResults<T>(results: readonly T[]): { items: T[]; limited: boolean } {
  return {
    items: results.slice(0, SEARCH_RESULT_RENDER_LIMIT),
    limited: results.length > SEARCH_RESULT_RENDER_LIMIT,
  };
}

function isValidRange(range: SearchMatchRange, length: number): boolean {
  return Number.isFinite(range.start) && Number.isFinite(range.end) &&
    Number.isInteger(range.start) && Number.isInteger(range.end) &&
    range.start >= 0 && range.end > range.start && range.start < length;
}

/** Convert snippet-relative UTF-16 ranges into renderable text segments. */
export function highlightSearchSnippet(
  text: string,
  ranges: readonly SearchMatchRange[] = [],
): SearchTextSegment[] {
  const normalized = ranges
    .filter((range) => isValidRange(range, text.length))
    .map((range) => ({
      start: Math.max(0, Math.min(text.length, range.start)),
      end: Math.max(0, Math.min(text.length, range.end)),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: SearchMatchRange[] = [];
  for (const range of normalized) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  if (merged.length === 0) return text ? [{ text, highlighted: false }] : [];
  const segments: SearchTextSegment[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start), highlighted: false });
    segments.push({ text: text.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false });
  return segments.filter((segment) => segment.text.length > 0);
}

export function getSearchStatusLabel(status: SearchStatus, processed: number, total: number): string {
  if (status === "searching") {
    const safeTotal = Math.max(0, total);
    return `正在搜索 ${Math.max(0, processed)}/${safeTotal} 章`;
  }
  if (status === "complete") return "搜索完成";
  if (status === "error") return "搜索失败";
  return "";
}

function resultSegments(result: SearchPanelResult): SearchTextSegment[] {
  return result.highlightedSnippet ?? highlightSearchSnippet(result.snippet, result.matchRanges);
}

export function SearchPanel(props: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rendered = limitSearchResults(props.results);
  const statusLabel = getSearchStatusLabel(props.status, props.processed, props.total);
  const hasQuery = props.query.trim().length > 0;
  const showEmpty = props.status === "complete" && hasQuery && props.results.length === 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
    }
  };

  return (
    <>
      <div className="search-backdrop" aria-hidden="true" onClick={props.onClose} />
      <div
        className="search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="正文搜索"
        onKeyDown={handleKeyDown}
      >
        <div className="menu-head search-head">
          <span>正文搜索</span>
          <button className="tb-btn" type="button" onClick={props.onClose} aria-label="关闭搜索">✕</button>
        </div>
        <div className="search-input-wrap">
          <input
            ref={inputRef}
            className="search-input"
            type="search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="搜索当前书正文"
            aria-label="搜索当前书正文"
          />
          {props.query.length > 0 && (
            <button
              className="search-clear"
              type="button"
              onClick={() => props.onQueryChange("")}
              aria-label="清空搜索"
            >
              ×
            </button>
          )}
        </div>
        <div className="search-status" aria-live="polite">
          {statusLabel}
          {props.status === "searching" && props.onCancel && (
            <button className="search-cancel" type="button" onClick={props.onCancel}>取消</button>
          )}
          {props.status === "error" && props.errorMessage && <span className="search-error">：{props.errorMessage}</span>}
        </div>
        {!hasQuery && props.status !== "searching" && (
          <div className="search-empty">输入关键词搜索当前书的正文</div>
        )}
        {showEmpty && <div className="search-empty">未找到匹配内容</div>}
        {props.navigationBusy && <div className="search-navigation-busy">正在定位结果…</div>}
        {rendered.items.length > 0 && (
          <div className="search-results" role="list" aria-label="搜索结果">
            {rendered.items.map((result) => (
              <button
                key={result.id}
                type="button"
                className="search-result"
                role="listitem"
                disabled={props.navigationBusy}
                onClick={() => props.onSelect(result)}
                title={result.chapterPath ?? result.chapterTitle}
              >
                <span className="search-result-chapter">{result.chapterTitle}</span>
                <span className="search-result-snippet">
                  {resultSegments(result).map((segment, index) => segment.highlighted
                    ? <mark key={`${result.id}-match-${index}`}>{segment.text}</mark>
                    : <span key={`${result.id}-text-${index}`}>{segment.text}</span>)}
                </span>
              </button>
            ))}
          </div>
        )}
        {(props.truncated || rendered.limited) && (
          <div className="search-truncated">结果较多，仅显示前 {SEARCH_RESULT_RENDER_LIMIT} 条</div>
        )}
      </div>
    </>
  );
}
