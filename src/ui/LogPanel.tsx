export interface LogItem {
  kind: string;
  source: string;
  message: string;
}

export interface LogPanelProps {
  items: LogItem[];
  /** 渲染诊断文本（可选） */
  diagText?: string | null;
  onClose(): void;
}

export function LogPanel(props: LogPanelProps) {
  return (
    <div className="log-panel">
      <div className="log-head">
        <span>日志与诊断</span>
        <button onClick={props.onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit" }}>
          ✕
        </button>
      </div>
      <div className="log-section-title">问题</div>
      {props.items.length === 0 ? (
        <div className="log-empty">没有记录到问题。</div>
      ) : (
        props.items.map((item, i) => (
          <div key={i} className={`log-item ${item.kind === "book_error" ? "error" : ""}`}>
            <span className="src">[{item.source}]</span>
            {item.message}
          </div>
        ))
      )}
      <div className="log-section-title">渲染诊断</div>
      <pre style={{ margin: 0, padding: "0 12px 12px", whiteSpace: "pre-wrap", fontSize: 11.5 }}>
        {props.diagText ?? "（打开面板时自动采集）"}
      </pre>
    </div>
  );
}
