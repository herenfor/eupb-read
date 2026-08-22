# 任务：打开期阅读进度链修复

- 状态：待用户审核
- 创建日期：2026-08-22
- 最后更新：2026-08-22
- 对应 Bug：B-050

## 目标

- 将“是否读过”的位置证据与整数全书百分比解耦，避免打开期统计未完成时把已有位置显示为未读。
- 为结构性章节计数增加有界、可取消的本机派生缓存，并保留错误章节为 unknown/error。
- 保持快速翻页最后稳定位置胜出，且每次成功进度写入都清除新书标记。
- 统一新导入时间语义，并让存档合并优先保留真实阅读证据。

## 非目标

- 不改变 EPUB 渲染/CSS 兼容规则，不修改 `docs/rendering-layers.md`。
- 不同步本机章节计数缓存，不迁移既有测试书架，不改变跨平台存档版本。
- 不恢复打开时同步扫描整书，也不启动长期 Vite/Chromium 服务。

## 当前现象与证据

- 打开多章书后快速翻页并立即返回书架，位置已保存但全书 count 尚未完成，`progressPct` 仍是 0；书架仅依据百分比显示“未读”。
- `setPage()` 的 `emit` 在 `captureAnchor()` 之前；本任务先增加回归审查，只有实证旧锚点后再调整顺序。

## 已确认根因

- B-039 的 incomplete summary 只能保留 baseline 百分比，而 shelf UI 把该暂时值误当成阅读证据；打开期 idle 统计也可能在连续输入期间延迟。

## 必须保持的行为

- 位置字段可以先保存，未完成统计不得伪造精确百分比；完整 estimated 仅显示“约”。
- `markOpened` 只能清 `isNew`；进度写入不得用旧整条记录覆盖新位置。
- `linear=no` 不计入分母；纯媒体章节有正的保守权重；任意章节末页不得强制 100%。

## 预计修改文件

- `src/ui/readEvidence.ts`、`src/ui/ShelfView.tsx`：阅读证据判定与书架显示。
- `src/ui/chapterCounts.ts`、`src/ui/chapterCountJob.ts`、相关测试：error/媒体权重/有界调度。
- `src/ui/chapterCountCache.ts`、相关测试：本机版本化计数缓存。
- `src/App.tsx`、`src/ui/progressWriter.ts`、`src/ui/shelf.ts`：会话、缓存、状态栏和进度写入。
- `src/ui/libraryArchive.ts`、相关测试：存档阅读证据合并。
- `src-tauri/src/linked_library.rs`：新导入时间与成功进度写入的新书标记。
- `docs/MODULE_CONTRACTS.md`、`docs/BUGFIX_LOG.md`、`docs/SOURCE_DELTA.md`：契约、Bug 和交接状态。

## 验收标准

- [x] 位置证据与百分比显示分离。
- [x] 打开期统计缓存、错误、媒体章节和调度有回归。
- [x] 新导入时间和存档合并有回归。
- [x] 进度会话首次写入立即提交，且每次成功位置写入清除 `isNew`。
- [x] 全量 Vitest、TypeScript、Vite production build、Rust fmt/check/test 通过；Windows WebView2/发布包仍待用户确认。

## 实际修改

- 新增 `hasReadPosition/hasReadEvidence`，书架显示不再把暂时 0% 当成未读；浏览器/Rust 新导入时间改为 0，成功进度写入清除 `isNew`。
- 章节计数增加 error/媒体权重、默认每 slice 最多 4 章且 100ms timeout 的有界 job；版本化有界 localStorage structural cache 最多 256 entries/100000 counts，按 contentHash 优先键控并 merge-preserve structural estimates；状态栏区分计算中/约/精确，最后 linear 章末页允许 100%。
- portable merge 先按阅读证据再按时间，writer 增加 per-session `beginSession`；未改变 paginator `setPage` 顺序。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| 相关定向 Vitest | 7 文件、48/48 通过 | 2026-08-22 |
| 全量 Vitest | 36 文件、332/332 通过 | 2026-08-22 |
| `tsc --noEmit` | 通过 | 2026-08-22 |
| Vite production build | 98 modules，通过 | 2026-08-22 |
| Rust `cargo fmt --check`、`cargo check --quiet`、`cargo test --quiet` | 14/14 通过 | 2026-08-22 |

## 不应同步的本地文件

- `node_modules/`、`dist/`、Rust target、测试书、截图、浏览器产物和本机缓存。

## 待完成与风险

- Windows WebView2、发布包关闭/隐藏时序和真实目标 EPUB 仍需用户实机确认。

## 交接说明

实现完成后先阅读本文件、B-039/B-037 和最新 `SOURCE_DELTA.md`，再核对缓存不进入 portable archive。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
