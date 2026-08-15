export interface ToolbarProps {
  /** 书名（显示在顶部状态栏） */
  title: string;
  issueCount: number;
  onToggleMenu(): void;
  onToggleLog(): void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <div className="toolbar">
      <button className="tb-btn" onClick={props.onToggleMenu} title="菜单">
        ☰
      </button>
      <span className="tb-title" title={props.title}>
        {props.title}
      </span>
      <button className="tb-btn" onClick={props.onToggleLog} title="日志与诊断">
        诊断{props.issueCount > 0 ? <span className="issue-badge">{props.issueCount}</span> : null}
      </button>
    </div>
  );
}
