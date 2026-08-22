# 任务：极窄窗口脚注弹层完整可见

- 状态：待用户审核
- 创建日期：2026-08-22
- 最后更新：2026-08-22
- 对应 Bug：B-055/C-44

## 目标

- 修复脚注 payload 的 `.main` 局部坐标与原本位于 `.main` 外的绝对定位坐标系不一致，导致工具栏 offset 被漏算、极窄窗口弹层越界。
- 将 `FootnotePop` 放入 `.main`，并用纯 placement helper 在容器坐标系内完成横向/纵向完整可见布局。

## 约束与边界

- 宽度为 `min(300, containerWidth - 2*gap)`，不得为负；右侧完整可放优先，随后左侧，均不可放时按空间较大侧选择并 clamp。
- 垂直优先上方，否则下方；两侧均不完整时选空间较大侧并 clamp。容器不足时 `maxHeight=height-2*gap`，内容继续由 overflow-y 滚动。
- 所有坐标和尺寸有限、非负；真实 `.main` 尺寸和卡片尺寸变化才提交 state。不得改 hover gate、分页、popup 定位算法之外的 CSS 语义或 Rust。

## 实际修改

- 新增 `src/ui/footnotePlacement.ts` 与 8 项纯函数回归，覆盖正常右上、左右切换、四角/极窄、上下切换、低高容器、非法坐标和 UI scale 边界。
- `FootnotePop` 使用真实 `.main.clientWidth/clientHeight` 与 ResizeObserver/resize cleanup，卡片采用 placement 输出的 width/top/left/maxHeight。
- `App` 将弹层 JSX 移入 `.main` 内容之后、status bar 之前，复用 `.main{position:relative}` 坐标系并保持 z-index 60。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| placement、footnote、paginator、lifecycle、hover gate、style 定向 Vitest | 92/92 通过 | 2026-08-22 |
| `tsc --noEmit` | 通过 | 2026-08-22 |
| `pnpm exec vitest run` | 40 files、353 tests 通过 | 2026-08-22 |
| `pnpm build` | Vite 102 modules，通过 | 2026-08-22 |

## 待完成与风险

- Windows WebView2 UI scale 实机仍需确认浏览器实际 offsetWidth/Height 与 ResizeObserver 时序；不改变 B-054 的 hover grace。

## Root 独立验收

- WSL Chromium 在 Tauri minWidth 对应 640×480 下，目标书 `[简][初鹿野創].有谁规定了在现实中不能有恋爱喜剧的？.03` 后记第 2/3 页 `note_ref020`：`.main` rect 为 `0,42,640x417`，card rect 为 `59.40625,50,300x295.421875`，`fullyInside=true`；card `clientHeight=293`、`scrollHeight=293`，无截断/内部滚动。
- marker→card 250ms 后 `added=1 removed=0`；离开两域 300ms 后最终 `added=1 removed=1`，C-43 未回归。临时 5174 已停止，5173/5174 均无监听。
