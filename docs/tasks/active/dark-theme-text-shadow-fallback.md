# 任务：深色主题文字阴影可读性兜底

- 状态：代码与自动化回归完成，待用户/Windows WebView2 审核
- 创建日期：2026-08-22
- 最后更新：2026-08-22
- 对应 Bug：B-056/C-45

## 目标

- 仅在 `theme=dark` 的章节覆盖样式中，为 `#epub-viewer` 注入 `text-shadow: 1px 1px 1px #1e1e1e`。
- 通过 `text-shadow` 的继承，为浅色作者盒子/复杂背景中的默认文字提供可读性兜底。
- 作者后代明确写出的 `text-shadow`（包括 `none` 和特效）仍可通过正常级联覆盖，不使用通配符或 `!important` 强制压制。

## 非目标

- 不修改现有 `applyDarkThemeContrast` 的局部颜色修正、分页流程或 Rust/Tauri。
- 不在 light/sepia 主题注入阴影，不按书名/class 特判，不重写作者显式文字特效。

## 根因与选择

深色模式默认前景色与深色背景匹配，但作者的浅色盒子、背景图或复杂半透明背景无法始终由局部对比度扫描安全修正。继承一层与深色主题背景一致的 1px 阴影可以作为低侵入兜底；规则放在 `#epub-viewer` 本身，避免 `#epub-viewer *` 和 `!important` 破坏作者显式声明。

## 实际修改

- `src/render/sanitize.ts`：dark theme 的主题覆盖样式增加 `#epub-viewer { text-shadow: 1px 1px 1px #1e1e1e; }`。
- `src/render/sanitize.test.ts`：验证 dark 有且声明不含 `!important`/通配符强制规则，light/sepia 无该规则。

## 本地验证

| 命令 | 结果 | 日期 |
|---|---|---|
| `pnpm exec vitest run src/render/sanitize.test.ts` | 54/54 通过；覆盖作者后代 `text-shadow:none` 与特效声明保留 | 2026-08-22 |
| 全量 Vitest | Root 独立复验：40 文件、354/354 通过 | 2026-08-22 |
| `tsc --noEmit`、Vite production build | Root 独立复验通过；Vite 102 modules | 2026-08-22 |

## 待完成与风险

- 阴影是继承式兜底，会增加默认文字绘制成本；Windows WebView2 窄窗、长章节、图片背景和作者显式 `text-shadow:none` 的实书观感/性能仍待用户确认。
- 未启动 dev server，未修改 Rust。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
