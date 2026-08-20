# 任务：增量章节字数统计与进度基线保护

- 状态：代码与自动化回归完成，待用户审核
- 创建日期：2026-08-20
- 最后更新：2026-08-20
- 对应 Bug：B-039

## 目标

- 打开书籍时不再同步扫描整本书的 `chapterChars`。
- 以 generation-bearing collection 区分 unknown、estimated、measured；当前已完成章节的 `anchor.totalChars` 是权威 measured 值。
- 其余章节在后台 idle job 中逐章统计；每个 slice 最多处理一章，任务可取消，旧书/旧 session 的回调不得写入新书。
- 统计未完成时，进度百分比沿用打开书架时保存的 baseline；只有完整 summary 可计算后才更新 baseline。
- 复用 B-037 的结构排除规则，provisional 扫描不参与 CSS、分页或布局。

## 非目标

- 不做 CSS rewrite cache、相邻章节预加载、URL 租约或 Rust schema 变更。
- 不做跨 chunk HTML lexer 或流式 ZIP 读取；未访问章节的 CSS `display:none`/`visibility` 只能被 provisional 估算，不能宣称与最终 computed visibility 等价。
- 不改变页面中心只读 caret、文本锚点、自然分页首列或 `linear=no` 权重契约。

## 当前现象与根因

- 打开书架条目时，App 曾同步对全部 spine 解码正文、正则去标签并构造 `chapterChars`，阻塞首屏。
- 统计未完成时，旧实现把未知章节当作 0，使分母暂时过小，进度可能被写成 0/100 或覆盖旧书架进度。
- 根因是整本同步扫描与 UI state 直接承担异步权威，缺少 generation/source 优先级和 baseline 保护。

## 选择的修复

- `src/ui/chapterCounts.ts` 提供纯 collection/apply/summarize/progress helper。数值必须是 safe finite nonnegative integer；`measured` 不可被 `estimated` 覆盖；`linear=no` 不入分母。
- `src/ui/chapterCountJob.ts` 使用可注入 `requestIdleCallback`/短 `setTimeout` scheduler。每次回调只处理一章；结构上排除 script/style、hidden、`aria-hidden=true` 和明确 `epub:type=footnote` 的 aside，去除 Unicode whitespace，parser/资源失败以 estimated 0 完成并留下诊断。
- App 维护 `countsRef`（异步权威）与 `countsState`（UI 快照），以 generation、book/server 身份和取消状态保护回调。ready 后用当前 session 的 spine/path/anchor 校验写 measured。
- `resolveProgressPct(exact, baseline)` 统一在 UI/persist 使用；exact 为 null 时保留经校验/夹紧的 baseline，不把 incomplete summary 写成临时 0/100。返回书架前从 `countsRef` 即时计算并 flush。
- `ResourceServer` 增加默认 4 MiB/32 项 text LRU，按 `text.length * 2` 估算；单条超限不缓存；`revokeAll()` 清除 entries/bytes，hits/misses 保留为生命周期诊断累计值。
- `ChapterPaginator.measure` 每次等待拥有独立 AbortController；字体等待与 iframe `defaultView` double-rAF 在正常完成时清理 timer，在新 load/cleanup/dispose 时 abort/cancel，并保留 loadSeq/document/viewer 最终校验。

## 必须保持的行为

- provisional count 只服务进度估算，绝不写 DOM/style、改变 CSS、参与分页或布局；未访问章节的 CSS 隐藏只能估算。
- 扫描未 complete 时页码/文本 anchor 仍可保存，但百分比沿用书架 baseline；summary complete 后才用当前 anchor 计算最新值。
- 同书切章不重建整书 job；A 书 callback 不得污染 B 书；返回书架、换书和 effect cleanup 必须取消 idle/timer。
- ResourceServer URL cache/revoke 生命周期保持 B-036 契约；新增 text LRU 不改变 URL cache。

## 实际修改

- `src/ui/chapterCounts.ts`、`src/ui/chapterCountJob.ts` 及测试：纯 counts 口径和可取消增量 job。
- `src/render/textAnchor.ts`：导出结构排除判据供 provisional/measured 共用。
- `src/App.tsx`：移除同步全书扫描，接入 generation/count refs、idle job、measured ready 和 baseline progress。
- `src/render/asyncWait.ts`、`src/render/paginator.ts` 及测试：可取消 fonts/rAF 等待。
- `src/render/resources.ts`、`src/render/resources.test.ts`：有界 text LRU。

## 验收标准

- [x] 打开书籍不再同步读取全部章节文本。
- [x] generation/source 优先级、emoji/code-point、隐藏结构、linear=no、complete/null progress 有回归。
- [x] idle job 每 slice 一章，缺资源/parser 失败完成为 estimated 0，A→B/abort 不写旧 session。
- [x] 未完成保存 baseline；complete 后 exact progress 更新，exact 0/100 可覆盖旧 baseline。
- [x] fonts/rAF 正常完成清 timer，abort 清 pending rAF/timer，旧 measure 不进入布局。
- [x] LRU 覆盖 hit、淘汰、超大条目、revokeAll。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| B039 定向 Vitest（counts/job/asyncWait/resources/textAnchor/paginator 与 B037/B038 回归） | 10 个文件、69/69 通过 | 2026-08-20 |
| 全量 `pnpm test` | 31 个测试文件、269/269 通过 | 2026-08-20 |
| `tsc --noEmit` | 通过 | 2026-08-20 |
| `pnpm build` | TypeScript/Vite production build 通过 | 2026-08-20 |

## 不应同步的本地文件

- `node_modules/`、`dist/`、测试书、截图、浏览器产物和临时复现文件不属于同步内容。

## 待完成与风险

- 未访问章节的 CSS computed hidden 只有当前章节完成 iframe 渲染后才可准确纳入 measured index；后台 provisional 统计明确不承诺该部分。
- Windows WebView2、真实 EPUB 矩阵和发布包内存行为仍需用户人工确认。

## 交接说明

先阅读本文件、`docs/MODULE_CONTRACTS.md`、`docs/BUGFIX_LOG.md`、`docs/SOURCE_DELTA.md` 及 B-036～B-038。后续若扩展预加载或 CSS cache，必须另立任务，不要把 provisional count job 变成布局依赖。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
