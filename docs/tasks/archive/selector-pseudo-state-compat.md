# 任务：修复选择器结构语义与交互伪类

- 状态：已发布，随 0.1.5 归档
- 创建日期：2026-08-17
- 最后更新：2026-08-17
- 对应 Bug：B-008、B-009、B-010

## 目标

使用 `/home/herenfor/test/测试用epub/【测试专用】选择器.epub` 验证并修复以下行为：

1. `title.xhtml` 中 body 顶层的“测试”“测试2”不被作者规则 `div p` 误匹配；
2. `:target` 卡片点击 `#target1/#target2` 后，对应元素进入目标状态并高亮；
3. 安全的文本框、checkbox、radio 得以保留，使 `:enabled/:disabled/:checked` 生效并可交互。

## 非目标

- 不修改真实源仓 `/home/herenfor/test/eupb-read`；
- 不恢复 EPUB 脚本、form 提交或危险文件选择控件；
- 不重构整个分页架构；
- 不修改测试 EPUB。

## 当前现象与证据

- `title.xhtml` 的 `div p{background-color:yellow}` 原本只应命中作者 div 内的 p；消毒器新增 `<div id="epub-viewer">` 后，body 顶层 p 也成为 div 后代；
- 分页器在纯页内锚点上调用 `preventDefault()` 和 `jumpToAnchor()`，未更新 iframe URL fragment，所以 `:target` 不成立；Chromium 实测 `history.replaceState(..., "#x")` 不激活 `:target`，`location.hash="#x"` 可以；
- `sanitize.ts` 的 `STRIP_TAGS` 包含 `input`，测试卡中的全部输入控件在输出前被删除。

## 已确认根因

- B-008：分页容器使用常见作者元素 `div`，改变了类型选择器的祖先匹配语义；
- B-009：阅读器接管锚点导航时没有同步浏览器 fragment 状态；
- B-010：安全策略无差别删除所有 input，阻断了无脚本表单状态伪类。

## 必须保持的行为

- 分页器仍能找到唯一的 `#epub-viewer` 并完成多栏分页；
- 不恢复脚本、form、button、select、textarea；至少拒绝 `input[type=file]`、提交/按钮类 input；
- 只保留明确允许的无提交型 input，事件属性仍删除，CSP `form-action 'none'` 保持；
- 页内锚点仍由分页器定位到正确列，脚注链接逻辑不受影响；
- 新 fragment 必须激活原生 CSS `:target`；
- 原有 B-007 子组合器修复不得回归。

## 预计修改文件

- `src/render/sanitize.ts`：避免 div 分页容器污染作者 `div p`；保留白名单 input；
- `src/render/sanitize.test.ts`：结构语义和安全 input 回归；
- `src/render/paginator.ts`：页内锚点更新 location.hash；
- 相关 paginator/浏览器测试：验证 `:target`；
- `docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md`：记录方案与差异。

## 实际修改

- `src/render/sanitize.ts`：将分页容器从常见的 `<div>` 改为 `<epub-viewer id="epub-viewer">`；注入的阅读器 CSS 显式声明该自定义标签 `display:block`，分页器继续只依赖稳定的 ID。这样不再把作者 body 顶层元素变成 `div p` 的后代。
- `src/render/sanitize.ts`：保留 `text`、`checkbox`、`radio` 及浏览器默认的空 `type`（text）输入控件；`file`、`submit`、`image`、`button`、`reset`、`hidden` 和其他类型仍删除。`form`、`button`、`select`、`textarea`、事件属性与 CSP 均保持原有禁止策略。
- `src/render/paginator.ts`：为普通纯 fragment 链接新增编码安全的解析与 hash 同步。先设置 iframe `location.hash` 激活原生 `:target`，再调用分页器定位；空 fragment 不操作，脚注分支与跨章分支维持原有优先级和路由。
- `src/render/sanitize.test.ts`：增加严格 XML 与 HTML 路径的 input 白名单/属性状态回归，并验证 body 顶层 p 不在 div 祖先下、作者 div 内 p 仍匹配。
- `src/render/paginator.test.ts`：新增 fragment 编码、空值、畸形编码和不可访问 iframe location 的逻辑回归。

## 验收标准

- [x] title 顶层“测试/测试2”背景透明，作者 div 内 p 仍被 `div p` 匹配为黄色。
- [x] 普通 fragment 解析、编码与 iframe hash 同步有逻辑回归；真实书 `:target1/:target2` 可切换高亮。
- [x] 安全 input 的初始 `checked`/`disabled`/`for` 属性保留；checkbox/radio 点击状态与样式同步变化。
- [x] file/submit/image/button/reset/hidden 等非白名单 input，以及 form/button/select/textarea 不进入输出。
- [x] 全量单测、类型检查与真实 EPUB Chromium 验证通过。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| Chromium 最小用例：`history.replaceState` | hash 改变但 `:target` 不生效 | 2026-08-17 |
| Chromium 最小用例：`location.hash` | `:target` 背景变为红色 | 2026-08-17 |
| 先写失败回归：`pnpm exec vitest run src/render/sanitize.test.ts src/render/paginator.test.ts` | 旧实现 5 项失败：无 fragment helper、input 全删、分页容器仍是 div | 2026-08-17 |
| 定向回归：`pnpm exec vitest run src/render/sanitize.test.ts src/render/paginator.test.ts` | 2 文件、45/45 通过 | 2026-08-17 |
| 全量回归：`pnpm test` | 11 文件、136/136 通过 | 2026-08-17 |
| 类型检查：`node node_modules/typescript/bin/tsc --noEmit` | 通过 | 2026-08-17 |
| `pnpm dev` + `/tmp/selector-full-app-check.mjs`（项目 Chromium） | title 顶层两个 p 透明、作者 div 内 p 黄色；`:target1/2` 互斥高亮；enabled/disabled 初始色正确；checkbox/radio 点击后 `:checked` 标签紫色高亮 | 2026-08-17 |

## 不应同步的本地文件

- `/home/herenfor/test/测试用epub/【测试专用】选择器.epub`
- `/tmp/target-history-check.mjs` 及后续临时验证脚本/输出

## 待完成与风险

- 自定义分页容器已在真实章节中确认按 block 参与布局，测试书分页与目标定位正常；
- `location.hash` 会触发原生 fragment 状态，真实书确认分页器随后仍能保持目标高亮和列定位；
- 白名单刻意不扩展到 hidden/password/date 等类型；若将来有无提交状态样式需求，应先做安全评审和回归。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [x] 用户已审核
- [x] 用户已同步到真实源仓
- 源仓提交：`4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`
