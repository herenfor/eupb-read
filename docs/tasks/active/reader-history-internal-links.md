# 任务：书内目录/链接跳转可撤销（B-026）

- 状态：待用户审核，尚未同步
- 创建日期：2026-08-18
- 最后更新：2026-08-18
- 对应 Bug：B-026

## 目标

修复 iframe 内书内链接无法进入撤销历史的问题，并让同章 `#fragment` 跳转也可撤销。目录、书签和普通书内链接最多保留 10 步，每次操作只写入一条快照。

## 根因

`ReaderView` 创建 `ChapterPaginator` 的 effect 只依赖 `[book, server]`，构造器回调捕获首次 render 的旧 `onInternalLink`。首次闭包通常处于 loading 状态，跨章链接一直无法记录历史。纯 fragment 在 paginator 内直接同步 hash/定位，也完全绕过 App 历史层。

## 实际方案

- `App` 抽取 `captureReaderHistory()`，只在 ready 且非空章时保存章节、页码和内容锚点；`navigateReaderHref()` 只执行跳转，不写历史。
- 侧边目录和书签入口先调用 capture，再调用只执行跳转；Paginator 内部链接由 `onBeforeInternalNavigate` 负责 capture，之后再调用内部跳转回调，避免重复入栈。
- `ReaderView` 用 latest ref 转发 `onInternalLink` 与 `onBeforeInternalNavigate`，长生命周期 paginator 不再捕获旧闭包。
- Paginator 对有效普通跨章链接和存在目标的普通 fragment 各通知一次，并把已解析 href 传给 before 回调；外部链接、脚注、无效跨章 href 和缺失 fragment 目标不产生历史。缺失 fragment 仍可在合理情况下同步 hash，但不强制整章重载。
- 撤销沿用 `anchorNonce`、`initialPage`、`initialAnchor` 恢复原章节、页码与内容锚点。

## 验收记录

- [x] Paginator 定向测试 20/20：跨章/fragment 各通知一次，外链不通知；既有布局回归保持通过。
- [x] 全量 Vitest 16 文件 185/185。
- [x] TypeScript 检查与 Vite build。
- [x] 真实 Chromium：目标书第 9 章目录点击 iframe 第一章链接后撤销按钮启用；撤销回到第 9 章且按钮恢复禁用。
- [x] 真实 Chromium：选择器测试书同章 fragment 跳转后撤销按钮启用；撤销恢复原页且按钮恢复禁用。
- [x] 真实 Chromium：无效跨章 href 与缺失 fragment 目标均保持撤销按钮禁用。
- [x] 真实 Chromium：跨章历史单次回退后没有残留第二条同操作历史。
- [ ] Windows WebView2 发布包人工确认。

## 修改文件

- `src/App.tsx`
- `src/ui/ReaderView.tsx`
- `src/render/paginator.ts`
- `src/render/paginator.test.ts`
- `docs/MODULE_CONTRACTS.md`
- `docs/BUGFIX_LOG.md`
- `docs/tasks/active/README.md`
- `docs/SOURCE_DELTA.md`
- `docs/PROJECT_CONTEXT.md`

## 不应同步的本地文件

- `/tmp/repro-reader-history.mjs`
- `/tmp/repro-reader-fragment.mjs`
- 测试 EPUB、`dist/`、`.pw-browsers/`、`.pw-libs/`

## 交接说明

继续修改链接路由时，先区分“记录历史”和“执行 href”两个动作；before 通知必须携带解析后的 href，并在实际位置变化前发生。不得在目录/书签回调与 paginator before 回调上同时记录；无效跨章目标和缺失 fragment 不能制造假历史。外链和脚注仍不进入阅读位置历史。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
