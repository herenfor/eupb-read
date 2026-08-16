import { useLayoutEffect, useRef, useState } from "react";

export interface FootnotePopProps {
  text: string;
  /** 图片注释/富文本注释的 HTML（书内已消毒内容） */
  html?: string;
  /** 点击固定：不随鼠标移出关闭，显示“已固定” */
  pinned: boolean;
  /** 标记在阅读区（.main）坐标系的矩形 */
  rect: { left: number; top: number; right: number; bottom: number };
  onClose(): void;
  /** 注释内外部链接：交给阅读器用系统默认浏览器打开 */
  onExternalLink?(url: string): void;
  /** 注释内返回链接（#锚点）：滚动到正文对应标记并关闭弹层 */
  onAnchor?(anchor: string): void;
  /** 指针进入/离开浮层：供阅读器暂停翻页键等全局输入 */
  onHoverChange(over: boolean): void;
}

/**
 * 注释弹层：锚定在标记右上方，不遮挡当前行。
 * 优先显示在标记上方；上方空间不足时显示在下方。
 * 内容可滚动（超长注释），滚轮在弹层内不会触发翻页。
 */
export function FootnotePop(props: FootnotePopProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 120 });

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [props.text, props.html, props.rect]);

  const gap = 8;
  const maxX = Math.max(320, (document.querySelector(".main")?.clientWidth ?? 800) - size.w - gap);
  const left = Math.min(Math.max(gap, props.rect.right + gap), maxX);
  // 优先上方；不足则放标记下方
  const aboveTop = props.rect.top - size.h - gap;
  const top = aboveTop >= gap ? aboveTop : props.rect.bottom + gap;

  return (
    <div className={`footnote-pop${props.pinned ? " pinned" : ""}`} onWheel={(e) => e.stopPropagation()}>
      <div
        ref={cardRef}
        className="footnote-card"
        style={{ left, top, width: 300 }}
        onMouseEnter={() => props.onHoverChange(true)}
        onMouseLeave={() => props.onHoverChange(false)}
        onClick={(e) => {
          e.stopPropagation();
          const a = (e.target as HTMLElement | null)?.closest("a");
          if (!a) return;
          e.preventDefault();
          const href = (a.getAttribute("href") ?? "").trim();
          if (/^(https?|mailto|tel):/i.test(href) || href.startsWith("//")) {
            props.onExternalLink?.(href);
            return;
          }
          if (href.startsWith("#")) {
            let anchor = href.slice(1);
            try {
              anchor = decodeURIComponent(anchor);
            } catch {
              /* 保留原样 */
            }
            if (anchor) props.onAnchor?.(anchor);
          }
          // 其他书内链接不在弹层里导航
        }}
      >
        <div className="footnote-head">
          <span>{props.pinned ? "注释 · 已固定" : "注释"}</span>
          <button className="tb-btn" onClick={props.onClose} title="关闭">
            ✕
          </button>
        </div>
        <div className="footnote-text">
          {props.html ? (
            <div className="footnote-html" dangerouslySetInnerHTML={{ __html: props.html }} />
          ) : (
            props.text
          )}
        </div>
      </div>
    </div>
  );
}
