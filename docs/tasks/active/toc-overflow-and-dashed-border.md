# 任务：目录页空滚动条与虚线底边兼容

- 状态：已完成，纳入 0.1.5 待同步
- 创建日期：2026-08-17
- 最后更新：2026-08-17
- 对应 Bug：B-017、B-018

## 目标

- 内容未超过页面高度的目录页不出现无意义滚动条。
- 书中合法的 `border-bottom: 1px #000 dashed` 在分页后按作者设计显示。
- 修复由 DOM、计算样式与分页测量条件触发，不依赖书名或章节名。

## 非目标

- 不修改测试 EPUB。
- 不调整目录文字、缩进或其他作者版式。
- 不扩展预渲染、缓存或滚轮交互功能。

## 当前现象与证据

- 样本：`/home/herenfor/test/测试用epub/【测试专用】[いのり。].我的推是坏人大小姐.02.epub`，目录页在内容未占满高度时出现滚动条。
- 样本：`/home/herenfor/test/测试用epub/【测试专用】[kiki].「凭妳也想讨伐魔王？」被勇者小队逐出队伍，只好在王都自在过活.04.epub`，目录页的 `border-bottom:1px #000 dashed` 未正确显示。
- 修复前第一本 Chromium 数据：iframe/html 高 739px，body 的 computed height 仍为 739px，但 content-box 外再加 16px/32px padding，body/html `scrollHeight=787px`。
- 修复前第二本 Chromium 数据：目标 div 的计算样式已经是 `1px dashed rgb(0,0,0)`；第 20 条目录项的虚线位于第一列 `(320,703)`，文字位于第二列 `(1624,35)`，同一个 inline a 横跨 1912px。

## 已确认根因

- B-017：阅读器强制 `body{height:100%}`，却让书籍 body 保持 content-box；上下 padding 被叠加到 100% 高度之外，产生与内容高度无关的根溢出。
- B-018：border 简写、子选择器和实际绘制都正常；默认 inline 的 a 直接包含 div/p 块，在 Chromium 多栏断点可被拆成两列，导致装饰线与文字分家。

## 必须保持的行为

- iframe 正文继续由 `#epub-viewer` 分栏并阻止浏览器原生正文滚动。
- 作者的合法 border 级联、颜色、线型与尺寸保持不变。
- 已修复的 margin、fit-content、SVG 全页图、隐藏首帧与滚轮行为不得回退。

## 预计修改文件

- `src/render/sanitize.ts` 或 `src/render/paginator.ts`：根据真实根因做最小通用修复。
- 对应测试文件：增加失败回归。
- `docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md`：记录根因、分层与隔离副本差异。

## 实际修改

- `src/render/sanitize.ts`：`html/body` 使用 border-box 并禁止根原生 overflow，保留书籍 padding；viewer 高度自然取 body 内容区。
- `src/render/sanitize.ts`：用零特异性规则识别直接包含常见块级结构的 a，默认设为 block 且 `break-inside:avoid`；普通 span/text 行内链接不命中，书籍具体规则可覆盖。
- `src/render/sanitize.test.ts`：新增根盒模型/overflow 与块链接分页原子性的两个失败回归。
- 文档：登记 B-017/B-018、C-21/C-22、模块契约与源仓差异。

## 验收标准

- [x] 第一本文字内容未占满目录页时，iframe、html、body、viewer 均无可滚动溢出。
- [x] 第二本目标目录项的计算样式为 1px dashed 黑色，实际绘制位置正确。
- [x] 定向回归、全量 Vitest、构建通过。
- [x] 两本真实 EPUB 在 WSL Chromium 中复验通过。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| 先写 `sanitize.test.ts` 两项回归 | 旧实现 2 项失败，确认测试可捕获问题 | 2026-08-17 |
| `pnpm exec vitest run src/render/sanitize.test.ts` | 47/47 通过 | 2026-08-17 |
| `pnpm test` | 13 文件、156/156 通过 | 2026-08-17 |
| `pnpm build` | TypeScript 与 Vite 生产构建通过 | 2026-08-17 |
| WSL Chromium，1280×800，第一本目录页 | html/body/iframe `739=739`，viewer `691=691`，body padding 16px/32px 保留 | 2026-08-17 |
| WSL Chromium，1280×800，第二本目录页 | 27 条中跨列拆分 1→0；第 20 条线/文字同列，2 页不变，border 为 1px dashed 黑色 | 2026-08-17 |
| 既有 B-012/B-013 Chromium 脚本 | 百分比 margin/fit-content 重排、SVG 全页图及 hr 的 1280/900px 回归均通过 | 2026-08-17 |

## 不应同步的本地文件

- `/home/herenfor/test/测试用epub/` 下的测试书。
- `/tmp` 下的一次性诊断脚本、截图与日志。
- 浏览器、依赖和构建产物。

## 待完成与风险

- 等待用户在实际界面审核两本书。
- 块链接规则使用 `:has()`；当前目标 Chromium 支持。未来若扩展到旧 WebView，应在消毒阶段标记等价结构，不应退回全局禁止 div 分页。

## 交接说明

代码与自动验证已完成。若用户仍认为虚线外观不符，先确认是新的线型/颜色要求还是其他视口下的新断点，不要再次改写已经正确的 border 简写。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
