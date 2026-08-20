# 任务：阅读设置快速变更的重载合并与锚点快照

- 状态：代码、自动化与 Chromium 回归完成，待用户审核
- 创建日期：2026-08-20
- 最后更新：2026-08-20
- 对应 Bug：B-040

## 现象与根因

在 900×650 的长书阅读器中，单次字号调整可以保留第 2 页位置；连续无间隔点击两次字号加号时，第二次设置可能在第一轮 paginator cleanup/iframe 隐藏期间启动，最终跳到第 1/3 页且旧 snippet 不可见。两次间隔约 600ms 时不复现。

根因是 ReaderView 对每次设置 identity 立即并发调用 `reloadWithSettings()`，而 paginator 的阅读锚点仍是可变对象，旧 reload 的清理时序会与新 reload 争用文档、显示门和位置。

## 选择的修复

- `ReaderView` 使用 150ms、可取消的 settings debounce；连续字号/主题/font identity 变化只执行最后一次 reload。章节、anchorNonce、book/server effect 变化和 dispose 会取消旧 timer；切章使用最新 render settings 走一次正常 `load`，不追加设置重载。
- `ChapterPaginator.reloadWithSettings()` 在任何 await/load 前同步执行一次只读 capture，复制 immutable `ReadingAnchor` 和当前 page，并调用 `load(path, { anchor, readingAnchor: snapshot, fallbackPage: page })`。没有 content document 时保留已有 anchor；text-only `-1` 仅存在内存快照，不写持久层。
- 旧 reload 仍由既有 `loadSeq`、VisibilityGate 代次、CSS Blob ownership 和 measure abort 保护；不新增队列，旧 settings 不能在新 settings 之后覆盖显示或页码。

## 非目标

- 不做 reload queue、相邻章节预加载、CSS rewrite cache、URL 租约、流式 ZIP 或 Rust schema 变更。
- debounce 只合并 UI 设置事件，不参与章节分页布局；自然分页、文本锚点优先级、页面中心只读采样和 display gate 契约保持不变。

## 回归与验证

- `settingsReload.test.ts` 覆盖 150ms 内快速两次设置只运行最后 task，以及章节变更取消 pending timer。
- `paginator.settings.test.ts` 覆盖 immutable anchor/current-page snapshot 和缺 document 时保留既有 anchor。
- B036 lifecycle 回归继续覆盖旧 load 不能解除新 display gate、旧 CSS Blob 不能覆盖新章节；paginator 定向组合为 4 文件 44/44。
- 真实 Chromium 已验证：测试书《有谁规定了在现实中不能有恋爱喜剧的？.03》在 900×650 下快速无延迟连续两次字号+，最终仍在第 2/3 页且旧 snippet 在当前页可见；无 pageerror。同章 direct 未发生 load/src/style mutation，返回书架重开后 anchor 一致。
- 全量 Vitest 33 个测试文件、273/273 通过；`tsc --noEmit` 与 Vite production build 通过。无 Rust 改动，不运行 cargo。

## 交接

请结合 `docs/MODULE_CONTRACTS.md`、`docs/BUGFIX_LOG.md`、`docs/SOURCE_DELTA.md` 和 B-036～B-039 审核 effect 清理时序及真实 Chromium 快速双击字号矩阵。若扩展到队列、预加载或缓存，必须另立任务。
