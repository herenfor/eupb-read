import type { TocNode } from "../core/types";
import { splitHref } from "../core/paths";

export interface TocPanelProps {
  toc: TocNode[];
  /** 当前章的内部路径（用于高亮） */
  activePath?: string;
  onNavigate(href: string): void;
  onClose(): void;
}

function TocList({
  nodes,
  level,
  activePath,
  onNavigate,
}: {
  nodes: TocNode[];
  level: number;
  activePath?: string;
  onNavigate(href: string): void;
}) {
  return (
    <div>
      {nodes.map((node, i) => {
        const active = activePath !== undefined && splitHref(node.href).path === activePath;
        const disabled = node.disabled === true;
        return (
          <div key={`${level}-${i}-${node.label}`}>
            <div
              className={`toc-item level-${Math.min(level, 2)}${disabled ? " disabled" : ""}`}
              style={{
                paddingLeft: `${8 + level * 14}px`,
                background: active ? "var(--accent)" : undefined,
                color: active ? "#fff" : disabled ? "var(--muted)" : undefined,
                opacity: disabled ? 0.6 : undefined,
                cursor: disabled ? "not-allowed" : undefined,
              }}
              title={disabled ? `无法使用：${node.href || "无有效链接"}` : node.label}
              onClick={() => {
                if (!disabled) onNavigate(node.href);
              }}
            >
              {node.label || "(无标题)"}
              {disabled ? " ⚠" : ""}
            </div>
            {node.children.length > 0 ? (
              <TocList
                nodes={node.children}
                level={level + 1}
                activePath={activePath}
                onNavigate={onNavigate}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function TocPanel(props: TocPanelProps) {
  return (
    <div className="toc-panel">
      <div className="toc-head">
        <span className="toc-title">目录</span>
        <span className="toc-count">
          {props.toc.length > 0 ? `${props.toc.length} 章` : "无"}
        </span>
        <button className="tb-btn" onClick={props.onClose} title="关闭目录">
          ✕
        </button>
      </div>
      {props.toc.length === 0 ? (
        <div className="toc-empty">（本书无目录）</div>
      ) : (
        <TocList
          nodes={props.toc}
          level={0}
          activePath={props.activePath}
          onNavigate={props.onNavigate}
        />
      )}
    </div>
  );
}
