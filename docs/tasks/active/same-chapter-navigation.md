# 任务：同一章节内导航不重载

- 状态：代码与自动化回归完成，待主代理最终审核
- 创建日期：2026-08-20
- 最后更新：2026-08-20
- 对应 Bug：B-038

## 目标

- 当前章节已完成布局且显示稳定时，目录、书签、历史和普通书内链接在同章内直接恢复位置，不重新 sanitize、创建 iframe Blob、等待字体或 measure/recompute。
- `current.xhtml#fragment` 与纯 fragment 保持 `:target` hash 同步；空 fragment/章首清除旧 hash。
- 同章恢复优先使用文本锚点，再使用 legacy 元素锚点，最后使用已保存页码；文本/legacy 解析失败时不得破坏当前稳定位置。
- 成功 direct 导航后由 App 捕获新稳定位置并恢复历史/进度门；跨章逻辑继续使用原有 load/display gate。

## 非目标

- 不做跨章预加载、全书 `chapterChars` 后台扫描、章节缓存或分页算法重构。
- 不改变 B-037 的文本锚点字段、自然分页首列、进度口径或持久化 schema。
- 不改变 Rust schema，因此本轮不运行 cargo。

## 当前现象与根因

- `App.navigateReaderHref` 对同章 href 也递增 `anchorNonce`；`ReaderView` effect 随后调用 `ChapterPaginator.load()`，造成整章 sanitize、iframe 导航、字体等待和测量。
- 同章书签及 history back/forward 通过 React 状态重载；原有 `jumpToAnchor` 只覆盖纯 fragment。
- 旧 iframe hash 会在同章书签/历史跳转后残留，继续触发旧目标的 `:target` 样式。

## 必须保持的行为

- direct 入口只在目标 spine path 等于当前 paginator path、DOM 已 ready 且显示稳定时使用。
- direct 失败返回 `false`，不清当前页、anchor、hash或 back/forward；书签/历史可在目标有效且有页码兜底时回到兼容 reload 路径。
- 读取候选 anchor 使用临时副本并以 `try/finally` 恢复 live 状态；Range/DOM 异常不得污染当前位置。
- 成功文本/legacy/页码恢复清除旧 hash；有效 fragment 写入新 hash；无效 fragment不制造假跳转或历史。
- 页面中心只作为只读 caret 采样，不能写 DOM/style、插入 spacer、改变 transform 或分页首列原点。
- 同章 direct 成功后不短暂设置 `readerDisplayReady=false`，不进入 iframe load；进度必须看到跳转后的最新页/锚点。

## 实际修改

- `src/render/paginator.ts`：新增同步同章导航入口、fragment preflight、hash 清除、失败事务和异常回滚。
- `src/ui/ReaderView.tsx`：ReaderHandle 暴露同章原子入口，并转发 settled。
- `src/App.tsx`：同章/跨章路由分流；TOC/书签和 history 使用 direct 成功后提交的事务语义。
- `src/ui/sameChapterNavigation.ts`：纯 direct/reload 判定与历史提交 helper。
- 对应 paginator、历史和 helper 测试。

## 验收标准

- [x] 同章 path#fragment、同章无 fragment、书签、history 不调用 paginator load。
- [x] 文本→legacy→saved page 优先级与越界/异常失败语义覆盖。
- [x] 成功恢复同步/清除 hash，失败保留旧 hash与当前位置。
- [x] direct 成功后历史才提交；失败不提交；跨章仍走 reload。
- [x] direct 路径不触发 measure/recompute，不隐藏阅读器。
- [x] 定向 Vitest、全量 Vitest、TypeScript、Vite build 通过。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| `vitest run src/render/paginator.test.ts src/render/paginator.lifecycle.test.ts src/ui/readerNavigationHistory.test.ts src/ui/readingProgress.test.ts src/ui/sameChapterNavigation.test.ts` | 49/49 通过 | 2026-08-20 |
| `tsc --noEmit` | 通过 | 2026-08-20 |
| 全量 `pnpm test` | 28 个测试文件、258/258 通过 | 2026-08-20 |
| `pnpm build`（TypeScript/Vite） | 通过 | 2026-08-20 |

## 不应同步的本地文件

- `node_modules/`、`dist/`、测试书、截图和浏览器产物不属于同步内容。

## 待完成与风险

- Windows WebView2 与真实 EPUB 的同章 direct/历史/`:target`矩阵仍需主代理人工确认。
- 本轮未做跨章性能优化；跨章仍按原有 display gate 和 load 流程。

## 交接说明

先阅读本文件、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、B-037任务；同章 direct 入口必须保持同步、无测量、失败可回退。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
