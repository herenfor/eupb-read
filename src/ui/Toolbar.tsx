export interface ToolbarProps {
  /** 书名（显示在顶部状态栏） */
  title: string;
  issueCount: number;
  /** 阅读视图：返回书架（书架视图不显示） */
  onBackToShelf?: () => void;
  /** 返回跳转前的阅读进度（目录/书内链接跳转后可用） */
  onHistoryBack?: () => void;
  canHistoryBack?: boolean;
  /** 打开目录（一级工具栏图标） */
  onOpenToc?: () => void;
  /** 书签：添加/移除当前页书签 */
  onToggleBookmark?: () => void;
  isBookmarked?: boolean;
  onOpenBookmarks?: () => void;
  onCloseBookmarks?: () => void;
  bookmarkMenuOpen?: boolean;
  bookmarks?: Array<{
    id: string;
    text: string;
    spineIndex: number;
    page: number;
    createdAtMs: number;
    chapterLabel?: string;
  }>;
  onSelectBookmark?: (id: string) => void;
  onToggleMenu?: () => void;
  onToggleLog?: () => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="tb-left">
        {props.onBackToShelf && (
          <button
            className="tb-btn tb-back"
            onClick={props.onBackToShelf}
            title="返回书架"
          >
            ← 书架
          </button>
        )}
        {props.onHistoryBack && (
          <button
            className="tb-btn tb-history-back"
            onClick={props.onHistoryBack}
            disabled={!props.canHistoryBack}
            title="返回跳转前的阅读进度"
          >
            ↩
          </button>
        )}
        {props.onToggleMenu && (
          <button className="tb-btn" onClick={props.onToggleMenu} title="菜单">
            ☰
          </button>
        )}
        {props.onToggleBookmark && (
          <div className="toolbar-bookmark">
            <button
              className={`tb-btn bookmark-toggle${props.isBookmarked ? " active" : ""}`}
              onClick={props.onToggleBookmark}
              title={props.isBookmarked ? "移除当前页书签" : "添加当前页书签"}
            >
              🔖
            </button>
            <button
              className="tb-btn bookmark-dropdown"
              onClick={() => {
                if (props.bookmarkMenuOpen) props.onCloseBookmarks?.();
                else props.onOpenBookmarks?.();
              }}
              title="书签列表"
            >
              ▾
            </button>
            {props.bookmarkMenuOpen && (
              <>
                <div className="bookmark-backdrop" onClick={props.onCloseBookmarks} />
                <div className="bookmark-pop">
                  <div className="bookmark-pop-title">书签</div>
                  {!props.bookmarks || props.bookmarks.length === 0 ? (
                    <div className="bookmark-empty">暂无书签</div>
                  ) : (
                    props.bookmarks.map((bookmark) => (
                      <button
                        key={bookmark.id}
                        className="bookmark-item"
                        onClick={() => props.onSelectBookmark?.(bookmark.id)}
                        title={bookmark.text}
                      >
                        <span className="bookmark-icon">🔖</span>
                        <span className="bookmark-main">
                          <span className="bookmark-text">
                            {bookmark.text || "（无文字）"}
                          </span>
                          <span className="bookmark-chapter">
                            {bookmark.chapterLabel || ""}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {props.onOpenToc && (
          <button className="tb-btn" onClick={props.onOpenToc} title="打开目录">
            📖
          </button>
        )}
      </div>
      <span className="tb-title" title={props.title}>
        {props.title}
      </span>
      <div className="tb-right">
        {props.onToggleLog && (
          <button className="tb-btn" onClick={props.onToggleLog} title="日志与诊断">
            诊断{props.issueCount > 0 ? <span className="issue-badge">{props.issueCount}</span> : null}
          </button>
        )}
      </div>
    </div>
  );
}
