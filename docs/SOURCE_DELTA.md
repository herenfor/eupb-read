# 隔离副本相对源仓的变化

本文件是跨对话交接的首要状态页，用于回答：“`epub-reader` 相比真实源仓改了什么、是否验证、是否已经同步？”

## 路径映射

- 隔离副本：`/home/herenfor/test/epub-reader`
- 真实源仓：`/home/herenfor/test/eupb-read`
- 用户口头所称 `epub-read` 在当前磁盘上的实际名称为 `eupb-read`。
- AI 不得修改、提交或推送真实源仓。

## 比较基线

- 源仓提交：`a07a79664377185b2f1273f3ba2f90e33a22e66d`
- 提交时间：`2026-08-17T00:42:14+08:00`
- 提交说明：`feat: update test book paths, footnote fixes, shelf polish`
- 建档前结论：排除依赖、构建产物、浏览器和 Rust target 后，两边应用代码一致。

## 当前未同步变化

状态：**`0.1.5` 发布候选已整理；有待同步的版本元数据、协作文档，以及 B-007 至 B-019 的选择器、结构、交互状态、版心、margin、fit-content、SVG 图片页、章节首帧、持续滚轮、根滚动、目录项断列与小头像 float 修复。**

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `.gitignore` | 对齐 | 补回源仓已有的 `src-tauri/target2/` 忽略项，使隔离副本与源仓一致 | 与源仓逐行比较 | 是，但源仓已包含，无需实际复制 |
| `AGENTS.md` | 新增 | AI 最短入口；声明隔离边界、阅读顺序和记录要求 | 人工检查链接与路径 | 是 |
| `CONTRIBUTING.md` | 新增 | 模型无关的单写入者协作流程、本地测试和交接规范 | 人工检查 | 是 |
| `docs/PROJECT_CONTEXT.md` | 新增 | 给新对话提供项目结构、基线、主链路与高风险区域；标记当前 `0.1.5` 发布候选及 158 项测试，注明 P0 已实现而 P1/P2 仍是预留 | 对照现有代码、版本元数据与文档 | 是 |
| `docs/MODULE_CONTRACTS.md` | 新增 | 固化解析、消毒、分页、UI 与存储边界；补充首次 display-ready、加载期输入、未来预渲染复用顺序，以及根页面不滚动/块链接不拆分契约 | 对照现有实现 | 是 |
| `docs/SOURCE_DELTA.md` | 新增 | 集中记录隔离副本相对源仓的未同步变化 | 与目录差异核对 | 是 |
| `docs/BUGFIX_LOG.md` | 新增 | 记录 Bug、根因、约束和选择当前修法的原因 | 对照代码注释与渲染台账 | 是 |
| `docs/tasks/TEMPLATE.md` | 新增 | 非平凡任务的跨对话交接模板 | 人工检查 | 是 |
| `docs/tasks/active/README.md` | 新增 | 说明活动任务目录的使用、审核和清理方式 | 人工检查 | 是 |
| `docs/PRELOAD_PLAN.md` | 更新 | 用户批准并完成 P0 隐藏渲染；记录实际 display-ready 顺序、B-016 加载期输入缓冲，并保留 P1/P2 空间 | 对照 B-015/B-016 实现、浏览器帧/滚轮记录与后续非目标 | 是 |
| `README.md` | 更新 | 增加维护与 AI 协作入口，并把当前测试数更新为 158 | 链接与测试清单检查 | 是 |
| `package.json` | 发布元数据 | 应用版本由 `0.1.4` 更新为 `0.1.5` | 四处版本一致性脚本通过 | 是 |
| `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` | 发布元数据 | Rust 包、锁文件本项目条目和 Tauri 打包版本统一更新为 `0.1.5`；第三方锁定版本不变 | 四处版本一致；`cargo metadata --locked --no-deps` 识别 `epub-reader@0.1.5` | 是 |
| `src/App.tsx`、`src/styles.css`、`src-tauri/src/lib.rs` | 注释整理 | 把“书架（0.1.4）”旧阶段标题改为无版本“书架”，避免误认为当前应用版本 | 只读差异检查、TypeScript 与生产构建通过 | 是 |
| `docs/HANDOFF.md` | 更新 | 当前测试数改为 158，保持开发/发布检查说明与候选版本一致 | 与全量测试结果核对 | 是 |
| `docs/RELEASE_0.1.5.md` | 新增 | 给下一对话提供发布摘要、精确同步/排除范围、版本字段、验证结果、GitHub Release 草案和同步后检查顺序 | 与真实源仓 `diff -qr`、版本脚本及最终验证核对；22 个 Markdown 文档本地链接检查通过 | 是 |
| `src/render/sanitize.ts` | 修复 | B-007 保留 CSS 子组合器；B-008 用自定义 viewer 避免污染 `div p`；B-010 保留安全 input；B-011 让顶层 `a.reader-top` 默认参与块级版心；B-013 识别多看 `svg > image` 纯图片页并整页 contain；B-017 用根 border-box 保留 body padding 且禁止原生滚动；B-018 让直接含块结构的链接避免多栏内拆分 | 全量 156/156、`pnpm build`；真实 EPUB 与 B-011/B-013/B-017/B-018 Chromium 布局测量通过 | 是 |
| `src/render/sanitize.test.ts` | 测试 | B-007 组合器；B-008 结构语义；B-010 input 白名单；B-011 顶层链接版心；B-013 inline SVG 图片页资源、viewBox 与 fullpage；B-017 根盒模型/overflow；B-018 块链接原子分页规则 | `sanitize.test.ts` 47/47；全量 156/156 | 是 |
| `src/render/displayGate.ts` | 新增 | B-015 可测试的 iframe visibility 显示门：代次转交、原始 inline 恢复与超时/dispose 兜底 | displayGate 4/4、全量 154/154、真实 Chromium 逐帧验证 | 是 |
| `src/render/displayGate.test.ts` | 新增测试 | B-015 覆盖旧 token 不得揭示、连续换章转交、20 秒机制的缩短模拟与 dispose 清理 | 4/4；全量 154/154 | 是 |
| `src/render/paginator.ts` | 修复 | B-009 fragment、B-012/B-014 margin/fit-content、B-015 首帧显示门；B-016 display-ready 回调；B-019 排除只有直接 img/svg 的正常小型媒体 float，避免被文字补偿撑宽 | paginator 9/9、displayGate 4/4、turnIntent 7/7、全量 158/158、`tsc --noEmit`；布局逐帧、持续滚轮及头像实书测量通过 | 是 |
| `src/render/paginator.test.ts` | 新增测试 | B-009 fragment 边界；B-012 盒模型、百分比 margin 与优先级恢复；B-013 hr 双侧 border；B-014 正对称 margin；B-019 媒体专用 float 的正反边界 | 9/9；全量 158/158 | 是 |
| `src/ui/turnIntent.ts` | 新增 | B-016 display-ready 前的单槽意图，以及 ready 后外层锁定滚轮流的 80px 有符号累计器 | turnIntent 7/7、全量 154/154、真实 Chromium hidden/visible 连续 wheel 验证 | 是 |
| `src/ui/turnIntent.test.ts` | 新增测试 | B-016 覆盖单槽最后方向/ready/reset，以及 wheel 阈值、正反抵消与累计 reset | 7/7；全量 154/154 | 是 |
| `src/ui/ReaderView.tsx` | 修复 | B-016 外层阅读区始终接收可能被浏览器锁定的 wheel；loading 进入单槽，display-ready 后按阈值持续翻页 | 全量 154/154、`pnpm build`；向下到第二章 11/23、向上到第一章 2/10，不再卡第 2/倒数第 2 页 | 是 |
| `docs/rendering-layers.md` | 更新 | 登记 C-13 至 C-23 的序列化、结构、版心、margin、SVG、fit-content、首次绘制、hidden 输入、根盒模型、块链接 fragmentation 与媒体 float 冲突 | 对照 B-007 至 B-019 实现与真实 EPUB Chromium 结果 | 是 |
| `docs/BUGFIX_LOG.md` | 更新 | 记录 B-008 至 B-019 的根因、约束、最终方案、验证和剩余风险 | 对照代码、测试、逐帧/滚轮/目录/头像实书测量与任务记录 | 是 |
| `docs/tasks/active/child-combinator-serialization.md` | 新增 | 记录 B-007 的证据、约束、实现、验证和同步状态 | 与代码及测试结果核对 | 是 |
| `docs/tasks/active/selector-pseudo-state-compat.md` | 更新 | 记录 B-008/B-009/B-010 的实现、失败回归、自动化与真实 EPUB Chromium 验证 | 对照代码与测试结果 | 是 |
| `docs/tasks/active/percent-margin-fit-content-layout.md` | 新增 | 记录 B-012 标题/简介右移、分页异常、通用修复与重排验证 | 对照真实 EPUB 修复前后测量 | 是 |
| `docs/tasks/active/svg-image-and-hr-layout.md` | 新增 | 记录 B-013 多看 SVG 图片裁切与制作信息页 hr 版心验证 | 对照失败回归与真实 Chromium 多视口测量 | 是 |
| `docs/tasks/active/fit-content-symmetric-margin-layout.md` | 新增 | 记录 B-014 多个简介盒横向散开、补偿顺序与对称 margin 修复 | 对照失败回归、两本真实 EPUB 与多视口/字号测量 | 是 |
| `docs/tasks/active/initial-render-visibility-gate.md` | 新增 | 记录 B-015 首帧隐藏、异步自愈 ready 边界、同尺寸 reflow 空转与 P1/P2 非目标 | 对照显示门单测、全量构建和两组逐帧 Chromium 记录 | 是 |
| `docs/tasks/active/wheel-intent-during-hidden-render.md` | 新增 | 记录 B-016 hidden wheel、目标锁定、单槽/阈值取舍与跨 ready 连续快进回归 | 对照 turnIntent 单测、全量构建和 Chromium hidden/visible 事件流验证 | 是 |
| `docs/tasks/active/toc-overflow-and-dashed-border.md` | 新增 | 记录 B-017 短目录根滚动条和 B-018 虚线/文字跨列拆分的原始 DOM 数据、通用修复与实书验收 | 对照两个失败单测、全量 156/156、构建和两本真实 EPUB Chromium 测量 | 是 |
| `docs/tasks/active/media-only-float-avatar.md` | 新增 | 记录 B-019 头像 float 被文字补偿误命中的原始几何、最小内容边界、未处理的评论盒分页及实书验收 | 对照失败回归、全量 158/158、类型检查和 Chromium 中 14 个头像测量 | 是 |

## 不属于同步变化

以下内容是本地依赖、构建或测试产物，不应复制进真实源仓：

- `node_modules/`
- `dist/`
- `.pnpm-store/`
- `.pw-browsers/`
- `.pw-libs/`
- `src-tauri/target/`、`src-tauri/target2/`、`src-tauri/gen/`
- `targettmp/`
- `.img-repro.png`
- `/home/herenfor/test/测试用epub/` 中的本地测试书
- 一次性截图、日志和临时复现输出

## 后续更新规则

每次完成一项可同步改动后，在“当前未同步变化”中记录：

1. 文件路径；
2. 行为变化与修改原因；
3. 本地验证命令和结果；
4. 是否建议同步；
5. 若是 Bug，关联 `BUGFIX_LOG.md` 的编号。

用户确认已经同步后：

1. 更新新的源仓提交哈希；
2. 从“当前未同步变化”移除已同步项；
3. 在下方追加一次同步历史；
4. 保留未同步的本地实验项。

## 同步历史

尚无。本轮文档仍位于隔离副本，等待用户审核后同步。

## 推荐比较命令

仅用于只读核对，不执行复制：

```bash
diff -qr \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=target \
  --exclude=target2 \
  --exclude=gen \
  --exclude=.pnpm-store \
  --exclude=.pw-browsers \
  --exclude=.pw-libs \
  --exclude=.git \
  /home/herenfor/test/eupb-read \
  /home/herenfor/test/epub-reader
```
