import type { TocNode } from "../core/types";
import { splitHref } from "../core/paths";

export interface TocPanelProps {
  toc: TocNode[];
  /** 当前阅读位置的内部 href（路径可带 fragment，用于高亮） */
  activeHref?: string;
  onNavigate(href: string): void;
  onClose(): void;
}

/** 递归统计目录项，包含所有层级而不只是顶层章节。 */
export function countTocNodes(nodes: TocNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countTocNodes(node.children), 0);
}

/**
 * 找唯一活动目录项：fragment 精确匹配优先；否则同路径的章首项，再退回
 * 同路径第一项。返回节点引用供渲染层做 identity 比较，避免同章多项同时高亮。
 */
export function findActiveTocNode(
  nodes: TocNode[],
  activeHref?: string
): TocNode | undefined {
  if (!activeHref) return undefined;
  const active = splitHref(activeHref);
  const all: TocNode[] = [];
  const collect = (items: TocNode[]): void => {
    for (const item of items) {
      all.push(item);
      collect(item.children);
    }
  };
  collect(nodes);
  const samePath = all.filter((node) => splitHref(node.href).path === active.path);
  if (samePath.length === 0) return undefined;
  if (active.anchor) {
    const exact = samePath.find((node) => splitHref(node.href).anchor === active.anchor);
    if (exact) return exact;
  }
  return samePath.find((node) => splitHref(node.href).anchor === "") ?? samePath[0];
}

function TocList({
  nodes,
  level,
  activeNode,
  onNavigate,
}: {
  nodes: TocNode[];
  level: number;
  activeNode?: TocNode;
  onNavigate(href: string): void;
}) {
  return (
    <div>
      {nodes.map((node, i) => {
        const active = node === activeNode;
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
                activeNode={activeNode}
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
  const activeNode = findActiveTocNode(props.toc, props.activeHref);
  const count = countTocNodes(props.toc);
  return (
    <div className="toc-panel">
      <div className="toc-head">
        <span className="toc-title">目录</span>
        <span className="toc-count">
          {count > 0 ? `${count} 项` : "无"}
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
          activeNode={activeNode}
          onNavigate={props.onNavigate}
        />
      )}
    </div>
  );
}
