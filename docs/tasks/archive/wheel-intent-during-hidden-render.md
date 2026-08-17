# 任务：隐藏渲染期间保留滚轮翻页意图

- 状态：已发布，随 0.1.5 归档
- 创建日期：2026-08-17
- 最后更新：2026-08-17
- 对应 Bug：B-016

## 目标

用户持续滚轮跨过章节隐藏渲染时，加载期安全保留一次方向；章节显示后同一段被浏览器锁定在外层目标的滚轮流仍继续逐页快进/快退，不停在第 2/倒数第 2 页。

## 非目标

- 不把加载期间的每个 wheel 事件累计成多页队列。
- 不允许在页数未知时直接按临时 `pageCount=1` 跨章。
- 不实现惯性动画、手势系统或 P1 章节预加载。

## 当前现象与证据

- 复现步骤：在章节末页持续向下滚轮，保持滚动穿过下一章的隐藏渲染阶段。
- 样本或输入：任意相邻章节；真实浏览器验证使用现有测试 EPUB。
- 日志、截图或诊断：隐藏 iframe 不参与鼠标命中；第一次修正虽让 `.reader` 缓冲 loading 输入，却在 `isReady` 后忽略外层事件。浏览器把连续滚轮锁定在最初的外层目标，导致 visible 后仍不转交 iframe。

## 已确认根因

显示门引入了短暂但明确的不可交互阶段，而旧 UI 没有加载期输入意图缓冲和外层 wheel 兜底。第一次修正遗漏滚轮目标锁定，只在 loading 处理外层事件；实际同一手势在 ready 后仍可能继续命中外层，因此只消费缓冲的一页后便中断。

## 必须保持的行为

- 加载期间最多保留一个方向，防止快速滚轮跳过多页或多章。
- 最后输入方向覆盖之前方向。
- 必须等 B-015 的最终 display-ready 边界（含锚点/章末定位）后再执行。
- 错误和销毁不得残留待执行输入。
- 正常 ready 状态下的滚轮、键盘和按钮翻页行为不变。
- ready 后锁定在外层的高分辨率滚轮/触控板事件必须先累计阈值，不能一微小 delta 翻一页。

## 预计修改文件

- `src/ui/turnIntent.ts`：单槽翻页意图缓冲。
- `src/ui/turnIntent.test.ts`：缓冲、覆盖、消费和错误清理回归。
- `src/ui/ReaderView.tsx`：外层 wheel 兜底与 display-ready 后消费。
- `src/render/paginator.ts`：提供最终揭示完成回调。
- `docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/SOURCE_DELTA.md`：记录新时序契约与差异。

## 实际修改

- 新增 `TurnIntentBuffer`：display-ready 前只保留最后一个方向，ready 后消费一次；错误/销毁 reset。
- `ReaderView` 的外层 `.reader` 接收 hidden iframe 无法命中的 wheel；键盘、按钮和 iframe wheel 共用相同单槽规则。
- 章节边界请求立即标记 loading，避免 React effect 启动前的重复输入继续按旧章页数执行。
- `ChapterPaginator` 在首次准备、最终锚点/章末定位和显示门解除后触发 `onDisplayReady`，UI 不再用中途的普通 ready 事件消费缓冲。
- 二次修正新增 `WheelTurnAccumulator`：外层 `.reader` 在 loading/ready 都接收 wheel；loading 结果仍压进单槽，ready 后按与 iframe 相同的 80px 阈值持续翻页，覆盖浏览器滚轮目标锁定。

## 验收标准

- [x] 隐藏期间持续向下滚轮，目标章 ready 后自动再前进一页。
- [x] 大量同向输入只消费一次，不按事件数连跳。
- [x] 隐藏期间反向滚动时以最后方向为准。
- [x] `startAtEnd`、目录锚点和空章自动前进不被提前消费打断。
- [x] 全量测试、构建和真实 Chromium 连续滚轮回归通过。
- [x] 同一外层目标的滚轮流跨过 hidden→visible 后，向下和向上都能持续多页，不停在第 2/倒数第 2 页。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| `turnIntent.test.ts` | 7/7：单槽行为 + wheel 阈值、正反抵消与 reset | 2026-08-17 |
| `pnpm test`（WSL 原生 Node，`TMPDIR=/tmp`） | 13 文件、154/154 通过 | 2026-08-17 |
| `pnpm build` | `tsc` 与 Vite production build 通过 | 2026-08-17 |
| `/tmp/hidden-wheel-intent-check.mjs` + Chromium | hidden 阶段 20 个向下事件只推进到第二章 2/23；`下下下上` 最终返回第一章 10/10 | 2026-08-17 |
| `/tmp/latched-wheel-stream-check.mjs` + Chromium | 同一外层目标跨 ready：向下继续到第二章 11/23，向上继续到第一章 2/10 | 2026-08-17 |

## 不应同步的本地文件

- `<PROJECT_ROOT>/测试用epub/` 中的测试书。
- 一次性 Playwright 脚本、截图与日志。

## 待完成与风险

- 单槽不保留加载期事件数量与力度，极长加载完成后先推进一次；display-ready 后仍在发生的锁定滚轮事件会按阈值继续，这是防止加载期跳章同时保留快进的取舍。
- 移动端手势速度、惯性和取消语义留给 P2，不扩展当前缓冲器。

## 交接说明

先读 B-015/B-016、`src/ui/turnIntent.ts` 与 `ReaderView` 的 paginator 状态回调、`turnPageRef`、外层 `onWheel`。不要在 ready 后忽略外层 wheel（滚轮目标锁定），也不要把 loading 单槽改成无上限队列。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [x] 用户已审核
- [x] 用户已同步到真实源仓
- 源仓提交：`4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`
