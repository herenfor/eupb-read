# 任务：阅读会话与章节 Blob URL 生命周期

- 状态：代码与定向自动化完成，待全量验证与用户审核
- 创建日期：2026-08-20
- 最后更新：2026-08-20
- 对应 Bug：B-036（暂定）

## 目标

- 结束书籍会话时按“先持久化并 flush 最新进度 → React 提交卸载 ReaderView/paginator → 撤销 ResourceServer 全部 URL → 清空书籍会话状态”的顺序释放资源。
- ChapterPaginator 为每次 sanitize/load 维护局部 CSS Blob URL 所有权；成功提交到当前 iframe 后转移为当前章节所有权，失败、过期、换章和 dispose 均幂等撤销；换章还会撤销尚未提交 iframe 的旧 pending load 集合。
- 字体等待、超时、双 rAF 和兼容修正之间验证 disposed/loadSeq/document/viewer 身份；过期章节不再继续写布局。
- 页面正中间只用于观察阅读锚点，本阶段不让它参与布局、分页或渲染规则。

## 非目标

- 不做预加载、缓存、分页算法、锚点/进度 schema 或依赖变更。
- 不按书名、类名特判，不修改 `eupb-read`，不宣称 Windows 内存已人工验证。

## 当前现象与证据

- ChapterPaginator 的 sanitize `makeUrl` 直接创建 CSS Blob URL，没有局部所有权集合；失败或 loadSeq 过期可能泄漏。
- `App` 目前在返回书架时清空状态与隐藏 ReaderView 的顺序需要与 React 提交生命周期核对。
- `measure()` 在异步字体等待与双 rAF 后缺少明确的章节 document/viewer 身份 token 检查。

## 必须保持的行为

- 普通换章不得撤销整本书 ResourceServer 共享图片/字体 URL。
- ReaderView dispose 必须先于 ResourceServer revoke；旧章节异步任务不得污染新章节。
- VisibilityGate、B-002 loadSeq/reflowSeq 和最多两次自愈语义保持不变。
- React StrictMode 的 setup→cleanup→setup 依赖 cleanup 先 dispose paginator、再 revoke server；第二次 setup 可通过 ResourceServer 缓存 miss 重新生成共享 URL。未做 React 测试环境集成，需人工/浏览器确认。

## 预计修改文件

- `src/render/resources.ts`：保持 ResourceServer URL 共享与 `revokeAll()` 契约，必要时抽纯生命周期 helper。
- `src/render/paginator.ts`：章节 CSS URL 所有权、幂等撤销与过期测量 token。
- `src/ui/ReaderView.tsx`、`src/App.tsx`：React 会话销毁顺序与返回书架 flush 边界。
- 对应 `*.test.ts`：先失败后实现的生命周期回归。
- `docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/SOURCE_DELTA.md`：记录契约和验证。

## 验收标准

- [x] CSS Blob URL 在换章、sanitize 失败、loadSeq 过期、dispose 时恰好撤销一次。
- [x] ResourceServer `revokeAll()` 撤销共享资源 URL，普通换章不调用它。
- [x] App 返回书架 flush 后由 React cleanup 卸载 paginator，再撤销 server 并清空会话状态。
- [x] 过期 measure 在 fonts/rAF 等 await 后不进入兼容修正。
- [x] 定向/全量 Vitest、TypeScript、Vite build 通过；Rust 未修改不运行。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| `vitest run src/render/paginator.lifecycle.test.ts src/render/paginator.test.ts src/render/blobOwnership.test.ts src/render/resources.test.ts` | 40/40 通过（旧实现：新增 paginator lifecycle 与 token 回归失败；旧实现无法撤销 pending stale CSS URL） | 2026-08-20 |
| `tsc --noEmit` | 通过 | 2026-08-20 |
| `pnpm test` | 25 个测试文件、236/236 通过 | 2026-08-20 |
| `tsc --noEmit`、`pnpm build` | 通过（Vite production build） | 2026-08-20 |

## 不应同步的本地文件

- 无。测试书、截图和构建产物不列入同步。

## 待完成与风险

- React effect cleanup 的 StrictMode setup→cleanup→setup 与实际 WebView2 时序未在本地 React 集成测试中证明；ReaderView 同一 cleanup 已固定 dispose→revoke，仍需人工/浏览器确认。
- Windows WebView2/发布包内存释放不在本地验证范围。

## 交接说明

本任务只覆盖书籍会话与 Blob 生命周期；锚点采样、导航和进度口径由后续阶段处理。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
