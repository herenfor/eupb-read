# 任务：修复内联 CSS 子选择器失效

- 状态：已完成，纳入 0.1.5 待同步
- 创建日期：2026-08-17
- 最后更新：2026-08-17
- 对应 Bug：B-007

## 目标

EPUB 章节内联 `<style>` 中的子组合器（例如 `div > p`）在消毒、序列化并交给浏览器后保持有效；相邻兄弟、通用兄弟和后代选择器不得回归。

## 非目标

- 不修改真实源仓 `/home/herenfor/test/eupb-read`；
- 不重写选择器解析器，不改变书籍 CSS 的级联优先级；
- 不处理本次样本尚未证明存在的其他选择器问题；
- 不把本地测试 EPUB、截图或临时浏览器脚本提交到仓库。

## 当前现象与证据

- 复现步骤：打开测试书的“子选择器”测试页，预期直接子元素获得紫色边框和背景，实际规则不生效；
- 样本：`/home/herenfor/test/测试用epub/【测试专用】选择器.epub`；
- 样本规则：`.card-child .test-sandbox .parent>.direct-child { ... }`；相邻兄弟 `.prev+.next`、通用兄弟 `.start~.sibling` 及后代选择器正常；
- `XMLSerializer` 会把 `<style>` 文本中的 `>` 输出为 `&gt;`。HTML 的 style raw-text 语义不会把该字符引用还原为组合器，因此浏览器收到的是无效/错误的选择器文本；
- `sanitize.ts` 现有注释也因同一序列化问题刻意避开了 `>`，证明问题位于章节序列化出口，不是 CSS 改写器主动删除组合器。

## 已确认根因

`sanitizeChapter` 最终用 `XMLSerializer.serializeToString(doc)` 输出章节。序列化器为 XML 文本转义 `>`，但输出随后作为 HTML 文档装入 iframe；`<style>` 在 HTML 中是 raw-text 元素，`&gt;` 不会按普通元素文本的方式解码为 `>`，导致子组合器规则失效。`+`、`~` 和空格不需要 XML 实体转义，所以没有触发该问题。

## 必须保持的行为

- 只修复 `<style>` 元素内容中的序列化产物，不对整份 HTML 全局解码；
- `<` 必须继续转义，不能借 CSS 文本重新引入 `</style>` 逃逸或脚本注入；
- 外部样式表、内联 `style` 属性、资源 URL 改写及 CSP 行为保持不变；
- XML 严格解析与 HTML 降级路径都应覆盖；
- 相邻兄弟、通用兄弟、后代选择器保持原样。

## 预计修改文件

- `src/render/sanitize.ts`：在序列化出口安全恢复 style raw-text 中被转义的 `>`；
- `src/render/sanitize.test.ts`：增加组合器回归用例，并断言不是全局实体解码；
- `docs/BUGFIX_LOG.md`：补全 B-007 的最终方案与验证；
- `docs/SOURCE_DELTA.md`：记录隔离副本新增的产品代码变化。

## 实际修改

- `src/render/sanitize.ts` 在最终序列化出口增加窄范围恢复：只扫描序列化后的 `<style>...</style>` 内容，把 XMLSerializer 产生的 `&gt;` 恢复为 `>`；不处理整份 HTML，也不恢复 `&lt;`。
- `src/render/sanitize.test.ts` 增加严格 XML 与 XML 失败后 HTML 降级两条回归，覆盖无空格 `>`、`+`、`~`、后代组合器，以及非 style 文本和 `</style>` 逃逸边界。
- `docs/rendering-layers.md` 增加 C-13，记录 XML→HTML raw-text 序列化边界。

## 验收标准

- [x] 消毒输出中的 `div > p`（含无空格写法）保持为有效 CSS 文本；
- [x] `+`、`~`、空格组合器的回归断言通过；
- [x] 非 style 区域及 `<` 不被危险地反转义；
- [x] 全量单元测试通过；
- [x] 使用用户提供的测试 EPUB 验证目标规则在输出中保留。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| `vitest` 基线全量测试 | 129 项通过（修复前） | 2026-08-17 |
| 解包读取测试 EPUB 的 `message.xhtml` | 已确认子/兄弟/后代选择器测试规则 | 2026-08-17 |
| `env TMPDIR=/tmp node node_modules/vitest/vitest.mjs run src/render/sanitize.test.ts` | 40/40 通过 | 2026-08-17 |
| `env TMPDIR=/tmp node node_modules/vitest/vitest.mjs run` | 10 个测试文件、131/131 通过 | 2026-08-17 |
| `env TMPDIR=/tmp node node_modules/typescript/bin/tsc --noEmit` | 通过 | 2026-08-17 |
| `/tmp/epub-selector-check.ts`（项目 `loadBook` + `sanitizeChapter`） | EPUB3 `OEBPS/Text/message.xhtml` 输出保留 `.parent>.direct-child`，`downgraded=false`、`issues=0` | 2026-08-17 |
| `/tmp/epub-selector-browser-check.mjs`（项目 Chromium） | 子选择器匹配 2 个（背景 `rgb(237, 233, 254)`、边框 `rgb(139, 92, 246)`）；相邻兄弟匹配 1 个；通用兄弟匹配 3 个，三类预期背景均生效 | 2026-08-17 |

## 不应同步的本地文件

- `/home/herenfor/test/测试用epub/【测试专用】选择器.epub`
- `/tmp/epub-child-selector-repro.cjs`
- 浏览器缓存、截图与临时输出

## 待完成与风险

- 当前修复针对项目使用的 XMLSerializer 输出形式 `&gt;`；若未来更换序列化器并输出数字字符引用，需要单独增加证据后再扩展。
- 浏览器验证依赖本地 `.pw-browsers` 与 `.pw-libs`，这些目录和临时脚本均不属于同步内容。

## 交接说明

从 `sanitizeChapter` 的最终 `XMLSerializer` 出口入手。优先采用“仅在序列化后的 `<style>` 内容中恢复 `&gt;` 为 `>`”的窄修复；不要恢复 `&lt;` 或做整文档实体解码。先补失败用例，再改实现。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
