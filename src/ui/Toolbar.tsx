export interface ToolbarProps {
  /** 书名（显示在顶部状态栏） */
  title: string;
  issueCount: number;
  /** 阅读视图：返回书架（书架视图不显示） */
  onBackToShelf?: () => void;
  onToggleMenu?: () => void;
  onToggleLog?: () => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <div className="toolbar">
      {props.onBackToShelf && (
        <button
          className="tb-btn tb-back"
          onClick={props.onBackToShelf}
          title="返回书架"
        >
          ← 书架
        </button>
      )}
      {props.onToggleMenu && (
        <button className="tb-btn" onClick={props.onToggleMenu} title="菜单">
          ☰
        </button>
      )}
      <span className="tb-title" title={props.title}>
        {props.title}
      </span>
      {props.onToggleLog && (
        <button className="tb-btn" onClick={props.onToggleLog} title="日志与诊断">
          诊断{props.issueCount > 0 ? <span className="issue-badge">{props.issueCount}</span> : null}
        </button>
      )}
    </div>
  );
}
