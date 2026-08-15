import { useLayoutEffect, useRef, useState } from "react";

export interface FootnotePopProps {
  text: string;
  /** 标记在阅读区（.main）坐标系的矩形 */
  rect: { left: number; top: number; right: number; bottom: number };
  onClose(): void;
}

/**
 * 注释弹层：锚定在标记右上方，不遮挡当前行。
 * 优先显示在标记上方；上方空间不足时显示在下方。
 */
export function FootnotePop(props: FootnotePopProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 120 });

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [props.text, props.rect]);

  const gap = 8;
  const maxX = Math.max(320, (document.querySelector(".main")?.clientWidth ?? 800) - size.w - gap);
  const left = Math.min(Math.max(gap, props.rect.right + gap), maxX);
  // 优先上方；不足则放标记下方
  const aboveTop = props.rect.top - size.h - gap;
  const top = aboveTop >= gap ? aboveTop : props.rect.bottom + gap;

  return (
    <div className="footnote-pop">
      <div
        ref={cardRef}
        className="footnote-card"
        style={{ left, top, width: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="footnote-head">
          <span>注释</span>
          <button className="tb-btn" onClick={props.onClose} title="关闭">
            ✕
          </button>
        </div>
        <div className="footnote-text">{props.text}</div>
      </div>
    </div>
  );
}
