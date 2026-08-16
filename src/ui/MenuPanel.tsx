import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Theme } from "../render/settings";

export interface MenuPanelProps {
  fontSize: number;
  uiScale: number;
  theme: Theme;
  lineHeight?: number;
  fontWeight?: number;
  letterSpacingPx?: number;
  wordSpacingPx?: number;
  onOpenFile(): void;
  onOpenToc(): void;
  onFontDec(): void;
  onFontInc(): void;
  onFontSizeChange(v: number): void;
  onLineHeightDec(): void;
  onLineHeightInc(): void;
  onLineHeightChange(v: number): void;
  onWeightDec(): void;
  onWeightInc(): void;
  onWeightChange(v: number): void;
  onLetterSpacingDec(): void;
  onLetterSpacingInc(): void;
  onLetterSpacingChange(v: number): void;
  onWordSpacingDec(): void;
  onWordSpacingInc(): void;
  onWordSpacingChange(v: number): void;
  onUiScaleChange(v: number): void;
  onThemeChange(theme: Theme): void;
  onResetDefaults(): void;
  onClose(): void;
}

const UI_SCALES: Array<{ value: number; label: string }> = [
  { value: 0.85, label: "小" },
  { value: 1, label: "标准" },
  { value: 1.15, label: "大" },
  { value: 1.3, label: "特大" },
];

const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "sepia", label: "纸色" },
];

function fmtLineHeight(v?: number): string {
  return v === undefined ? "自动" : v.toFixed(1);
}

function fmtWeight(v?: number): string {
  if (v === undefined) return "自动";
  if (v <= 300) return "细体";
  if (v <= 400) return "常规";
  if (v <= 500) return "中等";
  if (v <= 600) return "半粗";
  return "粗体";
}

function fmtPx(v?: number): string {
  return v === undefined ? "自动" : `${v}px`;
}

interface SliderRowProps {
  label: string;
  /** 拖动条上方数值的格式化显示（基于预览值实时更新） */
  formatValue(v: number): string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange(v: number): void;
  onDec(): void;
  onInc(): void;
}

/**
 * 排版行：小 −/+ 按钮 + 中间拖动条，数值显示在拖动条上方。
 * 拖动只做本地预览；原生 change（松开鼠标/键盘确认/失焦）才提交，
 * 避免拖动过程中每次 input 都触发整章重排。
 */
function SliderRow(props: SliderRowProps) {
  const [draft, setDraft] = useState(props.value);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestValueRef = useRef(props.value);
  latestValueRef.current = props.value;

  // 外部值变化（± 按钮、恢复默认等）时同步预览值
  useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  // 原生 change 事件：拖动条松开/键盘一次修改完成/失焦时各触发一次
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const commit = (): void => {
      const v = Number(el.value);
      if (Number.isFinite(v) && v !== latestValueRef.current) props.onChange(v);
    };
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, [props.onChange]);

  const pct =
    ((draft - props.min) / (props.max - props.min)) * 100;

  return (
    <div className="slider-row">
      <span className="menu-label">{props.label}</span>
      <div className="slider-main">
        <span className="slider-value">{props.formatValue(draft)}</span>
        <div className="slider-line">
          <button className="step-btn" onClick={props.onDec} title="上一档">
            −
          </button>
          <input
            ref={inputRef}
            type="range"
            min={props.min}
            max={props.max}
            step={props.step}
            value={draft}
            style={
              {
                "--fill": `${Math.min(100, Math.max(0, pct))}%`,
              } as CSSProperties
            }
            onChange={(e) => setDraft(Number(e.target.value))}
          />
          <button className="step-btn" onClick={props.onInc} title="下一档">
            +
          </button>
        </div>
      </div>
    </div>
  );
}

/** 左侧滑出的二级菜单：收纳文件/导航/正文排版/界面/外观等操作。 */
export function MenuPanel(props: MenuPanelProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <div className="menu-panel">
      <div className="menu-head">
        <span>菜单</span>
        <button className="tb-btn" onClick={props.onClose} title="关闭">
          ✕
        </button>
      </div>

      <div className="menu-section">文件</div>
      <button className="menu-item" onClick={props.onOpenFile}>
        导入新书
      </button>

      <div className="menu-section">导航</div>
      <button className="menu-item" onClick={props.onOpenToc}>
        打开目录
      </button>

      <div className="menu-section">正文</div>
      <SliderRow
        label="字号"
        formatValue={(v) => `${v}px`}
        min={12}
        max={32}
        step={2}
        value={props.fontSize}
        onChange={props.onFontSizeChange}
        onDec={props.onFontDec}
        onInc={props.onFontInc}
      />
      <button
        className={`menu-item detail-toggle${detailOpen ? " open" : ""}`}
        onClick={() => setDetailOpen((v) => !v)}
        title="展开/收起详细排版设置"
      >
        详细设置 <span className="detail-arrow">{detailOpen ? "▾" : "▸"}</span>
      </button>
      {detailOpen && (
      <div className="detail-body">
      <SliderRow
        label="行高"
        formatValue={fmtLineHeight}
        min={1.4}
        max={2.2}
        step={0.2}
        value={props.lineHeight ?? 1.6}
        onChange={props.onLineHeightChange}
        onDec={props.onLineHeightDec}
        onInc={props.onLineHeightInc}
      />
      <SliderRow
        label="字重"
        formatValue={fmtWeight}
        min={300}
        max={700}
        step={100}
        value={props.fontWeight ?? 400}
        onChange={props.onWeightChange}
        onDec={props.onWeightDec}
        onInc={props.onWeightInc}
      />
      <SliderRow
        label="字间距"
        formatValue={fmtPx}
        min={0}
        max={8}
        step={2}
        value={props.letterSpacingPx ?? 0}
        onChange={props.onLetterSpacingChange}
        onDec={props.onLetterSpacingDec}
        onInc={props.onLetterSpacingInc}
      />
      <SliderRow
        label="字符间距"
        formatValue={fmtPx}
        min={0}
        max={16}
        step={4}
        value={props.wordSpacingPx ?? 0}
        onChange={props.onWordSpacingChange}
        onDec={props.onWordSpacingDec}
        onInc={props.onWordSpacingInc}
      />
      </div>
      )}

      <div className="menu-section">界面</div>
      <div className="theme-row">
        {UI_SCALES.map((opt) => (
          <button
            key={opt.value}
            className={`theme-btn${Math.abs(props.uiScale - opt.value) < 0.001 ? " active" : ""}`}
            onClick={() => props.onUiScaleChange(opt.value)}
            title={`界面缩放 ${Math.round(opt.value * 100)}%`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="menu-section">外观</div>
      <div className="theme-row">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`theme-btn${props.theme === opt.value ? " active" : ""}`}
            onClick={() => props.onThemeChange(opt.value)}
            title={`切换到${opt.label}主题`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="menu-section">其他</div>
      <button className="menu-item reset-btn" onClick={props.onResetDefaults} title="恢复所有设置为默认值">
        ↺ 恢复默认设置
      </button>
    </div>
  );
}
