# 任务：脚注 marker 与宿主弹层 hover 交接保护

- 状态：待用户审核
- 创建日期：2026-08-22
- 最后更新：2026-08-22
- 对应 Bug：B-054/C-43

## 目标

- 修复 iframe 脚注 marker 移入宿主 `FootnotePop` 时，Windows WebView2 窄窗口因 iframe `mouseout` 立即关闭弹层造成的闪烁。
- 用 140ms 可注入调度器 grace gate 合并 marker 与 overlay 的 hover 域；两者均离开且未固定时只关闭一次。

## 约束

- marker/overlay 任一进入都取消待关闭 timer；重复 mouseover 不重复解析、显示或发送同一仍可见 marker 的 payload。
- 普通正文或非脚注 anchor 的 mouseover 完全不触碰 gate；只有当前 iframe 文档内经 `isFootnoteLink` 确认的 anchor 才能 marker-enter/cancel pending close。
- 点击固定、再次点击、关闭按钮、正文空白关闭和章节替换/销毁语义保持不变；固定状态不受 hover 离开影响。
- 不修改 popup CSS、定位算法、分页和 Rust。

## 实际修改

- 新增 `src/render/footnoteHoverGate.ts` 及纯逻辑测试；`reset`/`dispose` 清理 timer 和可见/固定状态。`getFootnoteHoverAnchor` 与 footnotes 回归确保普通正文目标不会触碰 gate。
- `ChapterPaginator` 在 marker enter/leave、show/click pinned、overlay hover、dismiss、load cleanup/dispose 路径同步 gate；`ReaderHandle.setFootnoteOverlayHover()` 转发宿主状态。
- `App` 同步 `overlayHoverRef` 与 ReaderHandle；`FootnotePop` 仅在 offsetWidth/Height 实际变化时更新 size state。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| footnoteHoverGate、footnotes、paginator、lifecycle、footnoteStyles 定向 Vitest | 84/84 通过 | 2026-08-22 |
| `tsc --noEmit` | 通过 | 2026-08-22 |
| 全量 Vitest | 39 文件、345/345 通过 | 2026-08-22 |
| Vite production build | 101 modules，通过 | 2026-08-22 |

## 待完成与风险

- Windows WebView2 窄窗口真实 hover 时序仍需用户实机确认；grace 时间保持 140ms，后续仅依据实机证据调整。
- 不应同步 `/tmp` 下的临时复现脚本或浏览器产物。

## WSL Chromium 实机验证

- 640×480 目标书后记第二页 `note_ref020` 已验证 marker→宿主卡片交接：marker iframe 坐标为 `x=37.0..51.4`，宿主卡片为 `x=59.4..359.4`，中间 gap 为 8px。按 12 步移动进入卡片后等待 250ms，弹层仍 present，`MutationObserver` 为 `added=1 removed=0`。
- 离开 marker 与 overlay 两个 hover 域后等待 300ms，`MutationObserver` 变为 `added=1 removed=1`，恰好关闭一次，页码保持 `2/3`。
- 验证结束后已 Ctrl-C 释放 5174 端口；临时 `/tmp/repro-footnote-flicker.mjs` 不同步。
