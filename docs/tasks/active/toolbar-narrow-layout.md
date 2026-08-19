# B-028：工具栏窄窗口标题与控件布局

- 状态：已实现，待用户审核/同步
- 发现日期：2026-08-18
- 版本：0.1.7

## 现象与目标

旧工具栏使用 `1fr minmax(0,42%) 1fr`。窗口变窄时，左侧按钮的实际宽度可能超过分配列，`overflow:visible` 使按钮侵入标题区域；标题两行布局也没有窄屏标准省略号。

## 实现

- `Toolbar` 用 `ResizeObserver` 测量左右控件的实际 layout `scrollWidth`，取两侧最大值写入对称 `--toolbar-side-width`；宽屏使用对称侧轨和可收缩中间轨，保证标题在可完整显示时居中。窄屏切回不对称 `max-content minmax(0,1fr) max-content`，避免在空间不足时为追求居中而把较宽按钮组推出视口。
- 宽屏继续保留标题两行和 `clamp(9px,1.05vw,13px)` 字号；`max-width:720px` 时标题切换为单行 `nowrap + overflow:hidden + text-overflow:ellipsis`，原有 `title` 属性继续提供完整标题悬停查看。
- 仅修改阅读器 UI 工具栏 CSS，不改变正文标题、EPUB CSS 或 UI scale 的缩放机制。

## 验收

- Chromium 1080×760、640×480，UI scale 1/1.3：左右控件与标题 bounding rect 均无交叠，按钮均有可见矩形。
- 1080 宽屏保持两行；标题视觉中心与 toolbar 中心差为 0px（scale 1/1.3）。640 窄屏 computed 为 `display:block`、`white-space:nowrap`、`text-overflow:ellipsis`，字号为 9px 下限。
- 书架标题“EPUB 阅读器”中心差为 0px。
- 合成超长标题：640×480@1 `scrollWidth=439 > clientWidth=315`，@1.3 `472 > 171`；真实长标题在窄屏也保持控件不重叠。短标题矩形正常。
- 全量 Vitest：17 个文件、186/186；`tsc --noEmit` 与 Vite production build 通过。

## 后续

用户审核后同步到真实源仓；本地 `/tmp/repro-toolbar-b028.mjs` 不属于同步内容。
