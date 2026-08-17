# 任务：章节首帧隐藏渲染

- 状态：已发布，随 0.1.5 归档
- 创建日期：2026-08-17
- 最后更新：2026-08-17
- 对应 Bug：B-015

## 目标

章节内容在字体等待、二阶段布局补偿、首次分页重算以及目录锚点/章末定位全部完成前保持不可见；用户看到的第一帧即为最终稳定位置。

## 非目标

- 不实现相邻章节预加载、iframe 缓存池或 LRU。
- 不实现翻页动画、淡入动画或移动端手势。
- 不隐藏设置变化或窗口缩放导致的同章重排。

## 当前现象与证据

- 复现步骤：首次进入包含二阶段 margin/fit-content 修正的章节。
- 样本或输入：现有测试 EPUB 中的简介盒、图片与标题页。
- 日志、截图或诊断：普通章节在 `measure()` 完成前可见；只有 `startAtEnd` 分支临时隐藏 viewer，因此会看到盒子从初始位置移动到稳定位置。

## 已确认根因

iframe 的 blob 文档一加载就可见，而 `measure()` 在字体与双动画帧之后才应用二阶段布局补偿；`recompute()` 的自愈重试又是 fire-and-forget，外层无法等待真正稳定的 ready。

## 必须保持的行为

- `visibility:hidden` 必须保留布局测量能力，不能使用 `display:none`。
- 快速切章时旧章异步任务不能揭示或改写新章。
- 目录锚点、阅读锚点与 `startAtEnd` 必须在显示前完成定位。
- 错误或超时必须解除隐藏，不能永久空白。
- 正常同章翻页与后续图片重排不增加隐藏阶段。

## 预计修改文件

- `src/render/paginator.ts`：统一显示门、可等待的首次重算与最终定位。
- `src/render/displayGate.ts`：隔离可测试的 visibility 生命周期。
- `src/render/displayGate.test.ts`：代次、原样恢复与超时回归。
- `docs/PRELOAD_PLAN.md`：把 P0 更新为已批准/已实现，并保留 P1/P2。
- `docs/BUGFIX_LOG.md`：记录 B-015 的根因与取舍。
- `docs/rendering-layers.md`：登记渲染时序冲突。
- `docs/SOURCE_DELTA.md`：记录相对源仓变化。

## 实际修改

- 新增 `VisibilityGate`，以代次保护 iframe 的 `visibility:hidden!important`，并在正常、错误、20 秒超时和 dispose 路径原样恢复旧 inline 值。
- 所有章节入口统一隐藏，不再只处理 `startAtEnd`；首次准备完成字体/双 rAF、fit-content/margin/float 补偿、可等待的分页自愈以及目录锚点/章末定位后才揭示。
- `recompute()` 改为 Promise，调用者能等待内部最多两次重新测量；旧章节仍受 `loadSeq` 丢弃保护。
- 记录完整测量使用的 iframe 尺寸，过滤同尺寸 `ResizeObserver` 空转，避免 ready 后短暂恢复旧盒位置。
- P1/P2 继续留在 `docs/PRELOAD_PLAN.md`，未建立章节缓存池或动画。

## 验收标准

- [x] 普通章节从 blob 导航开始至最终分页定位前 iframe 保持隐藏。
- [x] 目录锚点与上一章末页入口在揭示前完成定位。
- [x] 布局自愈重试可以被首次 ready 流程等待。
- [x] 快速切章的旧代次不能揭示新章。
- [x] 错误、超时和 dispose 均可恢复原始 visibility。
- [x] 全量单测、TypeScript 检查和真实浏览器首帧回归通过。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| `pnpm test`（WSL 原生 Node，`TMPDIR=/tmp`） | 12 文件、147/147 通过 | 2026-08-17 |
| `pnpm build` | `tsc` 与 Vite production build 通过 | 2026-08-17 |
| `initial-render-gate-check.mjs` + Chromium | 简介页错误布局仅存在于 hidden 帧；首个可见帧与最终位置一致，500ms 内无二次跳动 | 2026-08-17 |
| `initial-render-start-end-check.mjs` + Chromium | 从第二章回翻，首个可见帧即上一章第 10/10 页，首/终 `scrollLeft=11646` | 2026-08-17 |
| `suspicious-summary-layout.mjs` + Chromium | 1280×800、900×650、字号 16→20px 的盒居中与分页回归通过 | 2026-08-17 |
| `selector-full-app-check.mjs` + Chromium | 子/后代选择器、`:target`、`:enabled/:disabled/:checked` 全部通过 | 2026-08-17 |

## 不应同步的本地文件

- `/home/herenfor/test/测试用epub/` 中的测试书。
- 一次性浏览器脚本、截图和日志。

## 待完成与风险

- 状态栏在首个实际绘制帧已经显示 ready 页码；显示门不修改 `ChapterState`。
- 20 秒超时只解除可见性，不伪造 ready；极端停滞时可能展示当前最佳布局，这是避免永久空白的明确取舍。
- P1/P2 的缓存范围、失效策略、移动端内存与动画仍待以后单独任务决定。

## 交接说明

先读 `docs/PRELOAD_PLAN.md`、`src/render/displayGate.ts` 与 `src/render/paginator.ts` 的 `load/onIframeLoad/prepareChapterForDisplay/recompute`。P1/P2 仍是后续扩展；应复用现有准备顺序，不要另建 ready 判定。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [x] 用户已审核
- [x] 用户已同步到真实源仓
- 源仓提交：`4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`
