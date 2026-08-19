# Bug 修复选择记录

本文不记录抽象的“技术偏好”，而记录真实 Bug 如何迫使项目选择当前方案。目的不是证明旧方案永远正确，而是避免新对话在不了解故障背景时撤销关键修复。

CSS 规则的逐项冲突编号仍以 `rendering-layers.md` 为准；本文记录跨模块原因与用户可见现象。

## 记录要求

修复非简单 Bug 时，追加一条记录，至少包含：

- 用户可见现象与触发操作；
- 可复现的 EPUB、合成章节或输入条件；
- 根因及其所在层；
- 修复必须满足的约束；
- 最终方案以及为什么选择它；
- 考虑但未采用的方案及原因；
- 修改文件；
- 本地验证和仍存风险。

## 记录模板

```markdown
## B-XXX：简短标题

- 状态：调查中 / 已修复 / 部分修复 / 已撤销
- 发现日期：YYYY-MM-DD
- 现象：
- 触发条件或样本：
- 根因：
- 约束：
- 选择的修复：
- 为什么这样修：
- 未采用方案：
- 修改文件：
- 验证：
- 剩余风险：
- 关联：C-xx、任务文件或提交
```

## 已知历史修复

以下内容根据现有代码、注释和渲染冲突台账回填，日期统一记为建档前。

## B-001：回翻上一章先闪第一页

- 状态：已修复
- 现象：在章节第一页继续向前翻时，新章节加载后先显示第一页，随后才跳到最后一页。
- 触发条件或样本：跨章向前翻页，上一章有多页内容。
- 根因：iframe 加载、字体等待和分页测量均为异步；内容在最终页数算出前已经可见。
- 约束：不能通过猜测页数提前滚动，也不能影响正常进入章节的显示。
- 选择的修复：`startAtEnd` 加载期间隐藏 viewer，完成测量并设置最后一页后再恢复可见。
- 为什么这样修：定位动作必须依赖真实页数；显示门能保证用户只看到最终位置。
- 未采用方案：加载后立即调用 `setPage`，因为此时 `pageCount` 仍可能是 1；用固定延时，因为字体和图片加载时间不稳定。
- 修改文件：`src/ui/ReaderView.tsx`、`src/render/paginator.ts`
- 验证：跨章回翻、快速连翻和无第一页闪帧的本地回归。

## B-002：旧章节延迟重排污染新章节

- 状态：已修复
- 现象：快速翻章或图片延迟加载时，阅读器可能停在错误页、沿用上一章页数或表现为卡在章末。
- 触发条件或样本：章节切换与旧章图片加载、ResizeObserver 或防抖 reflow 重叠。
- 根因：旧文档的异步测量完成后仍可能写回共享分页状态。
- 约束：不能取消所有图片重排，也不能让快速操作串行阻塞界面。
- 选择的修复：用 `loadSeq` 和 `reflowSeq` 标记当前代次，所有异步回调写回前核对代次并丢弃过期结果。
- 为什么这样修：代次校验不依赖底层异步任务是否支持取消，并能覆盖字体、动画帧、计时器和图片事件。
- 未采用方案：只清除定时器，因为已经进入 Promise/rAF 的测量仍会完成；全局互斥锁，因为会增加翻章等待。
- 修改文件：`src/render/paginator.ts`
- 验证：快速连续翻章、窗口重排和图片延迟加载本地回归。

## B-003：非 void 自闭合标签吞掉后续正文

- 状态：已修复
- 现象：某些 XHTML 章节在宽松 HTML 解析后丢失大片正文，或目录中后续字符被错误包进前一个 span/script。
- 触发条件或样本：`<script .../>`、`<span .../>` 等 XML 合法但 HTML5 不视为自闭合的标签。
- 根因：严格 XML 降级到 HTML 或 EPUB 3 HTML 解析时，HTML5 解析器忽略这些标签的自闭合斜线。
- 约束：`img`、`br` 等真正的 void 标签必须保持；脚本仍必须最终删除。
- 选择的修复：解析前把非 void 自闭合标签补成显式开闭标签，再执行正常消毒。
- 为什么这样修：在解析器吞内容之前修正结构，之后仍能统一应用危险标签删除规则。
- 未采用方案：解析后修 DOM，因为丢失的层级边界已经无法可靠恢复；永远强制 XML，因为不合规 EPUB 需要宽松容错。
- 修改文件：`src/render/sanitize.ts`
- 验证：消毒单测及相关目录页本地样本。

## B-004：宽屏下百分比盒子远宽于正文版心

- 状态：已修复
- 现象：书中 `width:90%` 的信息框在宽窗口几乎占满整页，而正文仍是 40rem；直接换成固定 em 后又会撑坏窄表格和注释容器。
- 触发条件或样本：宽窗口页面级百分比容器，以及 `td`、`note`、authorbox 等窄父容器。
- 根因：书籍通常按“页面约等于正文版心”设计百分比，阅读器的分页列却等于整个窗口宽度。
- 约束：页面级盒子不能过宽，窄父容器中的百分比仍必须相对真实父容器，超过 100% 的有意出血应保留。
- 选择的修复：把适用的 `width:X%` 改写为 `min(X%, X/100 × 40rem)`，并跳过纯标签、组合器、浮动和全页图等场景。
- 为什么这样修：浏览器可在真实包含块百分比和版心比例上限之间选择较小值，不再靠运行时猜父容器宽度。
- 未采用方案：统一固定 em 会撑坏窄容器；只按选择器类名特判无法覆盖未知 EPUB。
- 修改文件：`src/render/cssRewrite.ts`、`src/render/sanitize.ts`
- 验证：CSS 改写单测、sanitize 单测和宽度本地复现。
- 关联：`rendering-layers.md` C-07。

## B-005：多栏中的 float 与 fit-content 塌缩

- 状态：已修复
- 现象：聊天气泡、简介框等元素在 Chromium CSS 多栏中变成逐字窄条或异常宽度。
- 触发条件或样本：无显式宽度的浮动元素、`max-width:fit-content` 元素进入分页多栏。
- 根因：Chromium 多栏环境下 shrink-to-fit 和 fit-content 的使用宽度计算异常。
- 约束：书籍正常布局不应被统一定宽；补偿只能命中已经塌缩的元素，并在重新测量前恢复。
- 选择的修复：分页测量阶段检测异常；float 使用 Canvas 测量 max-content 后按父容器可用宽度写回，fit-content 使用版心上限补偿。
- 为什么这样修：只有浏览器完成真实布局后才能确认是否触发引擎问题，运行时条件比书名/类名特判更通用。
- 未采用方案：全局覆盖 float/fit-content，因为会破坏正常书籍设计；按单本书类名修复，因为无法扩展。
- 修改文件：`src/render/paginator.ts`
- 验证：相关真实书样本与布局诊断。
- 关联：`rendering-layers.md` C-08、C-09。

## B-006：默认居中覆盖书籍不对称 margin

- 状态：已修复
- 现象：目录交错缩进、namebox 等书内布局被阅读器默认居中规则抹平；简单移除居中又会让普通无布局章节贴边。
- 触发条件或样本：viewer 直接子元素具有书籍自定义 margin，或书籍存在通用 `div{margin:0}` reset。
- 根因：阅读器 L3 默认 margin 与书籍 L4 具体布局在同一元素上发生优先级冲突。
- 约束：普通直接子仍要默认居中，通用 reset 不应被误判为具体设计，嵌套布局应完全由书控制。
- 选择的修复：只标记 viewer 直接子；先按默认规则布局，再临时移除阅读器 margin 读取纯书值，对真正非零且非自动居中的不对称 margin 进行第二遍写回。
- 为什么这样修：两阶段测量能够区分“书没有意见”“书只是 reset”与“书明确设计了偏移”。
- 未采用方案：给所有元素强制居中会破坏嵌套布局；完全尊重 margin 会失去阅读器默认版心；类名白名单不可维护。
- 修改文件：`src/render/sanitize.ts`、`src/render/paginator.ts`
- 验证：目录交错、namebox、普通正文居中的本地回归。
- 关联：`rendering-layers.md` C-03、C-04。

## B-007：内联 CSS 子选择器在章节序列化后失效

- 状态：已修复
- 发现日期：2026-08-17
- 现象：`div > p` 一类子选择器不生效；相邻兄弟 `+`、通用兄弟 `~` 和后代选择器正常。
- 触发条件或样本：`<PROJECT_ROOT>/测试用epub/【测试专用】选择器.epub` 的 `message.xhtml` 内联样式 `.parent>.direct-child`。
- 根因：章节消毒完成后经 `XMLSerializer` 输出，`<style>` 文本中的 `>` 被转义为 `&gt;`；输出又作为 HTML 装载，而 style 属于 raw-text 元素，不会把它还原成 CSS 子组合器。
- 约束：不能整份 HTML 反转义；尤其必须保持 `<` 的转义，避免重新引入 `</style>` 逃逸；外部 CSS 和其他组合器不得变化。
- 选择的修复：在 `XMLSerializer.serializeToString(doc)` 之后，仅匹配序列化输出中的 `<style>...</style>` 块，把其中的 `&gt;` 恢复为 `>`；不恢复 `&lt;`，也不触碰 style 之外的文本、属性或外部 CSS blob。
- 为什么这样修：故障发生在 XML 到 HTML 的序列化边界，应该在该边界修复，避免改写或降级作者选择器；限定 raw-text 区域可以让 CSS 子组合器恢复，同时保持章节消毒与 URL 改写路径不变。
- 未采用方案：把所有 `>` 子选择器改成后代选择器，因为语义不同，会命中更深层后代；对整份 HTML 执行实体解码，因为会破坏属性/文本并产生注入风险；改用纯 HTML 序列化，因为会扩大 XHTML、自闭合标签和命名空间行为的变化面。
- 修改文件：`src/render/sanitize.ts`、`src/render/sanitize.test.ts`、`docs/rendering-layers.md`、`docs/tasks/archive/child-combinator-serialization.md`。
- 验证：严格 XML 与 HTML 降级回归均通过；`vitest` 全量 10 个文件、131/131 通过；`tsc --noEmit` 通过；用户测试 EPUB 的 `message.xhtml` 经项目 `loadBook`/`sanitizeChapter` 后保留 `.parent>.direct-child`。Chromium computed style 验证子选择器匹配 2 个（背景 `rgb(237, 233, 254)`、边框 `rgb(139, 92, 246)`），相邻兄弟匹配 1 个，通用兄弟匹配 3 个，预期样式均生效。
- 剩余风险：实现针对当前 XMLSerializer 的 `&gt;` 输出；若将来更换序列化器并输出数字字符引用，需另行验证。浏览器验证所用 `.pw-browsers`、`.pw-libs` 和 `/tmp` 临时脚本不属于同步内容。
- 关联：`docs/tasks/archive/child-combinator-serialization.md`。

## B-008：div 分页容器污染作者后代选择器

- 状态：已修复
- 发现日期：2026-08-17
- 现象：标题章节 body 顶层的“测试”“测试2”被 `div p{background-color:yellow}` 错误匹配，呈现整行黄色背景。
- 触发条件或样本：`【测试专用】选择器.epub` 的 `title.xhtml`。
- 根因：消毒器把全部正文包进新增的 `<div id="epub-viewer">`，改变了作者 CSS 的祖先类型关系。
- 约束：必须保留独立分页容器和直接子标记，不得破坏分页测量。
- 选择的修复：使用 `<epub-viewer id="epub-viewer">` 作为分页容器，并在阅读器注入 CSS 中显式设为 `display:block`；分页器仍按 `#epub-viewer` 查找容器。
- 为什么这样修：自定义标签不再成为作者 `div p`、`section p` 等常见类型选择器的祖先，同时保留现有 ID、直接子 `reader-top` 标记和分页 API。
- 未采用方案：针对 title 章节覆盖 `div p`，因为不能恢复所有未知作者选择器的结构语义；换成另一常见 HTML 标签同样可能污染类型选择器；移除容器会破坏分页器契约。
- 修改文件：`src/render/sanitize.ts`、`src/render/sanitize.test.ts`、`docs/rendering-layers.md`、`docs/tasks/archive/selector-pseudo-state-compat.md`。
- 验证：先写的回归在旧实现失败；最终严格 XML 逻辑回归证明 body 顶层 p 无 div 祖先、作者 div 内 p 仍匹配。全量 `vitest` 11 文件、136/136 通过，`tsc --noEmit` 通过。真实测试 EPUB Chromium 中“测试/测试2”背景均透明，`.titlebox p` 仍为黄色，分页容器标签为 `EPUB-VIEWER`。
- 剩余风险：自定义标签仍是额外 DOM 祖先；它避免常见 HTML 类型选择器污染，但无法还原 `body > *` 一类被包装结构改变的选择器，后续遇到样本需单独评估分页容器架构。
- 关联：C-14、`docs/tasks/archive/selector-pseudo-state-compat.md`。

## B-009：阅读器接管锚点后 :target 状态丢失

- 状态：已修复
- 发现日期：2026-08-17
- 现象：点击 `#target1/#target2` 能执行阅读器定位，但目标元素没有 `:target` 高亮。
- 根因：分页器阻止浏览器默认锚点导航后只调用 `jumpToAnchor`，没有更新 iframe 的 `location.hash`。
- 约束：脚注和跨章链接不受影响；更新 fragment 后仍由分页器控制最终列位置。
- 选择的修复：纯 fragment（且非脚注）先经 `getFragmentNavigation` 解析原始 hash 与解码后的目标 ID，安全写入当前 iframe 的 `location.hash`，再调用 `jumpToAnchor`。空 fragment 忽略，畸形百分号编码回退原文，iframe location 不可访问时吞掉异常而仍尝试分页定位。
- 为什么这样修：Chromium 最小复现确认 `location.hash` 才会激活原生 `:target`；保留原始编码给 URL、解码后查 DOM 同时覆盖标准 EPUB 链接和带空格/`#` 的 ID。
- 未采用方案：`history.replaceState` 已证实不改变 `:target`；放开默认锚点导航会绕开分页器的列定位；统一处理所有 `#...` 会破坏脚注的弹层优先分支。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/tasks/archive/selector-pseudo-state-compat.md`。
- 验证：先写的 helper 回归在旧实现失败；最终覆盖编码、空 fragment、畸形编码和不可访问 location。全量 `vitest` 11 文件、136/136 通过，`tsc --noEmit` 通过。真实测试 EPUB Chromium 中点击 `#target1/#target2` 后 hash 与粉色目标高亮同步切换，前一个目标恢复基础背景。
- 剩余风险：作者若用 `:target` 大幅改变目标尺寸，仍可能触发页数变化；当前样本只改变边框、背景与阴影，不改变盒子尺寸。
- 关联：`docs/tasks/archive/selector-pseudo-state-compat.md`。

## B-010：安全消毒删除全部 input 导致状态伪类失效

- 状态：已修复
- 发现日期：2026-08-17
- 现象：`:enabled/:disabled/:checked` 测试模块没有输入控件和状态样式。
- 根因：`STRIP_TAGS` 无差别删除所有 `<input>`。
- 约束：只恢复明确安全、无提交能力的 input 类型；事件属性继续删除，form 与危险控件继续禁止，CSP 不放宽。
- 选择的修复：从 `STRIP_TAGS` 移除 input，新增窄白名单：`text`、`checkbox`、`radio` 和 HTML 默认文本的空 type；其余类型整元素删除。
- 为什么这样修：这三类控件可提供所需的 `:enabled/:disabled/:checked` 状态和本地交互，不具备文件选择或提交/按钮语义。form 仍删除，事件属性仍在统一属性消毒中移除，CSP 的 `form-action 'none'` 未放宽。
- 未采用方案：恢复所有 input 或扩大到 password/date/hidden 等无本任务必要的类型，会扩大可交互表面且降低最小权限；只保留 checkbox/radio 会让默认文本控件失去 `:enabled/:disabled` 兼容性。
- 修改文件：`src/render/sanitize.ts`、`src/render/sanitize.test.ts`、`docs/tasks/archive/selector-pseudo-state-compat.md`。
- 验证：先写的严格 XML 与 HTML 路径回归在旧实现失败；最终验证 `checked`、`disabled`、label `for` 保留，事件属性被删除，file/submit/image/button/reset/hidden 和 form/button/select/textarea 被删除。全量 `vitest` 11 文件、136/136 通过，`tsc --noEmit` 通过。真实 iframe 中 enabled/disabled 初始背景正确，checkbox/radio 点击后状态与相邻 label 紫色高亮同步变化。
- 剩余风险：白名单刻意只覆盖 text/checkbox/radio；未来若需更多 input 类型必须单独安全评审。
- 关联：`docs/tasks/archive/selector-pseudo-state-compat.md`。

## B-011：顶层链接包裹块级正文时贴窗口左缘

- 状态：已修复
- 发现日期：2026-08-17
- 现象：`<a href="x.xhtml"><p>第一章</p></a>` 作为章节顶层内容时，文字版心贴在窗口左侧。
- 触发条件或样本：viewer 直接子为默认 inline 的 a，内部包含 p/div 等块级内容。
- 根因：`reader-top` 的 max-width 与左右 auto margin 标记在 a 上，但 inline 元素不应用这组块级版心尺寸。
- 约束：不能把所有书内链接强制定宽；作者明确声明的 display 应继续优先。
- 选择的修复：为 `a.reader-top` 增加零特异性 `display:block` 默认值，使页面级链接参与既有 40rem 版心布局；嵌套链接不受影响。
- 为什么这样修：问题只发生在 viewer 顶层链接，复用已有 reader-top 边界即可精准命中，不需要改写书籍 DOM 或给内部 p 追加错误的页面级标记。
- 未采用方案：给所有 a 强制 block 会破坏行内链接；给内部 p 添加 reader-top 会违反“只标记 viewer 直接子”的布局契约。
- 修改文件：`src/render/sanitize.ts`、`src/render/sanitize.test.ts`、`docs/rendering-layers.md`。
- 验证：`sanitize.test.ts` 44/44、全量 Vitest 11 文件 137/137、`tsc --noEmit` 通过。Chromium 1200px 视口实测 viewer 宽 1200px，顶层链接与内部 p 均宽 640px、左缘 280px，链接 computed display 为 block。
- 剩余风险：作者若明确把顶层链接设回 inline，阅读器尊重作者声明，版心行为由书负责。
- 关联：C-15。

## B-012：百分比 margin 与 fit-content 被二次推向右侧

- 状态：已修复
- 发现日期：2026-08-17
- 现象：测试书标题作者信息严重靠右并溢出到第二页；简介盒也整体靠右。
- 触发条件或样本：`【测试专用】[七菜なな].男女之间存在纯友情吗？（不，不存在！）.03.epub` 的 title/summary。
- 根因：`applyBookMargins` 对页面相对的百分比 margin 又叠加居中版心 base；auto margin 判断使用 content-box width，未计 padding/border，导致 fit-content 盒被误判为不对称 margin。
- 约束：通用修复，禁止类名/书名特判；重排可恢复；既有小幅 em 缩进、auto 居中和 C-09 保持。
- 选择的修复：auto-like 判断统一改用 border-box 宽度；对作者明确的 inline 水平百分比 margin，按需解除阅读器默认 max-width，读取并原位写回包含块相对布局，不再叠加版心 base。margin/max-width 临时写回同时保存值和优先级，重排前完整恢复。
- 为什么这样修：两处异常均来自同一个二阶段 margin 决策，而非 CSS 百分比改写器本身。
- 未采用方案：删除书的 35% margin 或强制 `.summary` 居中属于单书特判；统一取消 margin 补偿会复发 B-006。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/rendering-layers.md`、`docs/tasks/archive/percent-margin-fit-content-layout.md`。
- 验证：定向 49/49、全量 140/140、`tsc --noEmit` 通过。真实 Chromium 中标题由 2 页恢复为 1 页且不再右溢出；简介中心为 viewer 中心 x=640；字号放大两档重排后两页位置均无累计漂移。
- 剩余风险：当前百分比分支识别作者 inline style；若未来样本把水平百分比 margin 仅写在外部 CSS 中，需要在保持级联准确性的前提下扩展声明来源识别。
- 关联：C-16、`docs/tasks/archive/percent-margin-fit-content-layout.md`。

## B-013：inline SVG 图片页超过可视高度被裁切

- 状态：已修复
- 发现日期：2026-08-17
- 现象：多看格式的彩图/标题页使用 `div > svg > image` 包装时，图片下部超出显示范围；制作信息页的顶层 `<hr/>` 曾出现水平偏移。
- 触发条件或样本：`【测试专用】（多看）面对摆出姐姐架子的初恋对象、我是绝对不会屈服的！.epub` 的 `title.xhtml`、`title-zh.xhtml`、`contents-illus.xhtml` 与 `messa.xhtml`。
- 根因：纯图片页检测只统计 HTML `img`，未识别 SVG 的 `<image>`，因此页面没有进入 `fullpage-image` 模式；顶层 div 受 40rem 版心限制后，SVG 按 `viewBox` 固有比例得到 908.6px 高，超过 739px viewer 但仍被统计为 1 页。`hr` 则带有 UA 双侧 1px border，旧的 content-box margin 判断会产生与 B-012 相同的误判。
- 约束：不按书名/章节名/类名特判；文字页、多个图片的排版页和固定限宽 HTML 图片页不得放大；保留 SVG 的 `viewBox`、`preserveAspectRatio` 与内部 `<image>` 尺寸。
- 选择的修复：把“无文字、单个带 viewBox 的 SVG，且 SVG 直接包含单个 image”纳入纯图片页；全页高度只传递给 HTML 包装祖先，SVG 视口使用 100% 宽高，内部 image 继续由书的 `preserveAspectRatio` 控制。为 `hr` 增加显式 border-box 单测，不再新增运行时代码，因为 B-012 已通用修复。
- 为什么这样修：触发条件描述的是内容结构和流体尺寸意图，能覆盖同类多看 EPUB，又不会把正文 SVG 图标或信息图升级为整页图；复用现有 fullpage 生命周期，不增加新的分页补偿时序。
- 未采用方案：给所有 SVG 强制 `max-height`/固定像素高会误伤正文矢量图；按 `title.xhtml` 或 `title.jpg` 特判不能覆盖其他书；直接改 `<image>` 的 width/height 会破坏 SVG 坐标系与作者比例设计。
- 修改文件：`src/render/sanitize.ts`、`src/render/sanitize.test.ts`、`src/render/paginator.test.ts`、`docs/rendering-layers.md`、`docs/tasks/archive/svg-image-and-hr-layout.md`。
- 验证：定向 51/51、全量 Vitest 11 文件 142/142、`tsc --noEmit` 通过。真实 Chromium 1280×800 中三章 SVG 页均为 1/1 页且 `scrollHeight === clientHeight === 739`；标题图片高度由裁切的 908.6px 降为可视区内 678.2px。窗口缩至 900×650 后彩图仍为 1 页且完整显示。制作信息页所有 `hr` 在 1280px 与 900px 两种列宽、包括第二列中，border-box 中心均与列中心一致且没有运行时 margin 写回。
- 剩余风险：当前只接纳 SVG 直接包含一个 image 的纯图片结构；若以后出现合法的 `<defs>`/`<g>` 包装图片页，需要在不误判正文 SVG 的前提下扩展结构识别。
- 关联：C-17、`docs/tasks/archive/svg-image-and-hr-layout.md`。

## B-014：多个 fit-content 简介盒按内容长度横向散开

- 状态：已修复
- 发现日期：2026-08-17
- 现象：同一简介页的三个灰色盒没有沿同一正文轴排列：第一个近似居中、第二个明显偏左、第三个贴近页面左侧并在换列后继续错位。
- 触发条件或样本：`【测试专用】[final][こりんさん].班上的原偶像，总之就是举止可疑.02.epub` 的 `summary.xhtml`；页面级盒同时使用 `max-width:fit-content` 和后置 `div.summary{margin:1em}`。
- 根因：`measure()` 先按 Chromium 多栏中尚未补偿的异常 fit-content 宽度计算并写回 margin，之后才把 max-width 固定到 40rem，导致位置基于旧宽度、显示基于新宽度。其次，二阶段 margin 把左右相等的正值 1em 当成 `ml>0` 单向缩进，使正常双侧留白额外右移。
- 约束：不按 summary 类或书名特判；B-012 的百分比 margin、auto 居中和 border-box 判断保持；真正不对称的书籍缩进继续生效；无水平 margin 的 fit-content 左对齐语义保持。
- 选择的修复：测量稳定后先执行 fit-content 宽度补偿，再基于最终 border-box 宽度处理页面级 margin；通过本轮 fit-content 补偿元素集合保留原始收缩意图。新增正对称水平 margin 判定：仅正有限值且左右差小于 0.5px 时保持 reader auto 居中，负 margin 仍视为可能的双侧出血。
- 为什么这样修：盒宽是 margin 定位的输入，先稳定宽度才能得到确定位置；正对称留白没有左右方向，不应进入单向缩进分支。两项判断均由布局属性触发，可覆盖未知 EPUB。
- 未采用方案：强制 `.summary{margin:auto}` 会成为类名特判；统一忽略所有书 margin 会复发 C-04；禁止盒子跨页会改变内容分页并可能制造大片空白。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/rendering-layers.md`、`docs/tasks/archive/fit-content-symmetric-margin-layout.md`。
- 验证：先写的 symmetric margin 回归在旧实现失败；定向 52/52、全量 Vitest 11 文件 143/143、`tsc --noEmit` 通过。真实 Chromium 中 1280×800 的所有盒/跨列碎片均以 640px 宽在所属列居中；900×650 同样对齐。字号由 16px 放大到 20px 后盒宽变为 800px、页数由 2 变 3，所有碎片仍居中且无 `data-reader-margin-fixed` 累计写回。B-012 标题/简介实书脚本复跑通过。
- 剩余风险：正对称负 margin 被刻意保留为潜在出血布局；若未来真实样本需要对称负 margin 也相对版心处理，应独立评估。
- 关联：C-18、`docs/tasks/archive/fit-content-symmetric-margin-layout.md`。

## B-015：章节首次显示时稳定盒子仍横向闪动

- 状态：已修复
- 发现日期：2026-08-17
- 现象：首次进入简介等需要二阶段布局补偿的章节时，灰色盒会在一瞬间从偏左/偏右位置移到居中；已有 `startAtEnd` 隐藏只覆盖回翻上一章，普通入口仍会显示中间帧。
- 触发条件或样本：`【测试专用】[final][こりんさん].班上的原偶像，总之就是举止可疑.02.epub` 的简介页；首次逐帧记录还发现，组件挂载遗留的同尺寸 `ResizeObserver` 回调会在 ready 后再次撤销补偿约两帧。
- 根因：blob iframe 一加载即可绘制，但 `measure()` 要等待字体和双 rAF 后才应用 fit-content/margin/float 二阶段补偿。旧 `recompute()` 的自愈重试又是 fire-and-forget，外层 `.finally(showViewer)` 无法知道最终分页是否稳定。同尺寸 reflow 仍执行 `measure()`，会先恢复补偿值再等待，造成揭示后的第二次跳动。
- 约束：隐藏期间必须继续参与真实布局，不能用 `display:none`；普通进入、目录锚点、阅读锚点和 `startAtEnd` 共用同一稳定边界；快速切章的旧任务不能揭示新章；错误、超时和销毁不能留下永久空白；P1/P2 仅预留，不在本轮建立缓存池或动画。
- 选择的修复：新增独立 `VisibilityGate`，在 load、blob 导航和 iframe load 边界用带代次的 `visibility:hidden!important` 管理整个 iframe，并原样恢复既有 inline 值。把首次准备集中到 `prepareChapterForDisplay()`；`recompute()` 改为 Promise，能够等待内部最多两次测量自愈，随后执行目录锚点/章末定位再解除显示门。显示门提供 20 秒兜底，错误和 dispose 同样恢复。记录最近一次完整测量的 iframe 尺寸，尺寸未变时跳过 ResizeObserver 空转。
- 为什么这样修：隐藏 iframe 能阻止 blob 文档任何未稳定首帧漏出，同时 `visibility:hidden` 不改变尺寸和 CSS 多栏计算；代次门延续 B-002 的过期任务规则。将“准备完成”定义为可等待流程，也给以后相邻章节预渲染留下单一 ready 边界，而不提前引入缓存复杂度。
- 未采用方案：固定延时无法覆盖字体、图片和两次自愈；只在 `measure().finally()` 显示会早于异步 recompute 重试与最终定位；`opacity:0` 仍可接收指针事件且本轮不需要淡入；`display:none` 无法测量分页；立即实现前后章 iframe 池会把缓存失效、内存和竞态带入当前闪帧修复。
- 修改文件：`src/render/displayGate.ts`、`src/render/displayGate.test.ts`、`src/render/paginator.ts`、`docs/PRELOAD_PLAN.md`、`docs/PROJECT_CONTEXT.md`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/tasks/archive/initial-render-visibility-gate.md`。
- 验证：`displayGate.test.ts` 4/4，覆盖代次转交、原始 priority 恢复、超时与 dispose；全量 Vitest 12 文件 147/147、`pnpm build` 通过。真实 Chromium 逐帧检查中，简介页 load 时错误盒左缘 448/310/5 与中间帧 343/127/5/1299 均只在 hidden 状态出现；首个可见帧左缘 320/320/320/1614 与最终帧完全一致，揭示后 500ms 无再次跳动。从第二章回翻时目标章 load/首帧隐藏，首个可见帧即第 10/10 页且 `scrollLeft=11646`。1280→900 视口、16→20px 字号以及选择器整书的 `:target/:checked` 回归继续通过。
- 剩余风险：20 秒是防永久空白的可见性兜底；极端字体或引擎停滞超过上限时可能先显示当前最佳布局，但状态不会被伪造为 ready。P1 相邻章缓存和移动端真机内存/动画仍未实施。
- 关联：C-19、`docs/PRELOAD_PLAN.md`、`docs/tasks/archive/initial-render-visibility-gate.md`。

## B-016：隐藏渲染期间持续滚轮被吃掉

- 状态：已修复
- 发现日期：2026-08-17
- 现象：在章节末页持续向下滚轮进入下一章，虽然隐藏布局结束并显示了新章，但阅读器不再接着向下翻，用户必须重新滚动。
- 触发条件或样本：任意跨章滚轮；Chromium 自动回归使用 `【测试专用】[final][こりんさん].班上的原偶像，总之就是举止可疑.02.epub`，从第一章第 10/10 页持续滚向第二章。
- 根因：B-015 使用 `visibility:hidden` 保留布局，但 hidden iframe 不参与鼠标命中，加载阶段的 wheel 会落到外层 `.reader`。第一次修正只让外层在非 ready 时保存一个方向；真实使用继续暴露浏览器的滚轮目标锁定：同一段连续滚动开始命中外层后，即使 iframe 已显示，后续 wheel 仍可能发给外层，而第一次修正此时因 `isReady` 直接忽略，所以稳定停在第 2 页（反向为倒数第 2 页）。更早的旧逻辑还会把进入分页器的非 ready 输入直接丢弃。
- 约束：页数未知时仍不能立即翻页；大量 wheel 事件不能变成多页队列；方向反转时以最后输入为准；必须在 B-015 的字体、分页自愈、锚点/章末定位和显示门解除之后消费；空章、错误、换书和 dispose 不得误执行旧意图。
- 选择的修复：新增 UI 层 `TurnIntentBuffer` 单槽状态机。非 display-ready 时只覆盖保存最后方向，display-ready 后取出并清空一次；ready 状态立即放行。`ReaderView` 始终接收外层 `.reader` 的 wheel：新增 `WheelTurnAccumulator`，用与 iframe 分页器一致的 80px 有符号累计阈值把外层连续 delta 转成翻页，因而滚轮目标锁定跨过 ready 后仍可继续。分页器在 `prepareChapterForDisplay()` 成功、最终入口定位完成且显示门解除后触发独立 `onDisplayReady`；跨章请求立即标为 loading，错误和销毁 reset 缓冲与累计量。
- 为什么这样修：单槽表达“加载时仍想往最后方向继续”，而不是重放加载期硬件事件；一次准备最多消费一次。ready 后的事件已经是当前持续输入，应按阈值逐页执行，而不是继续压缩。独立 display-ready 回调避免目录锚点或 `startAtEnd` 被抢跑，有符号累计又兼容高分辨率触控板的小 delta 与中途反向。
- 未采用方案：取消非 ready 防护会按临时页数错误跨章；累计每个 wheel 会在高分辨率滚轮/触控板下瞬间跳过很多页；改回 `opacity:0` 仅为接收事件会重新引入透明内容的交互与无障碍问题；固定延时后翻页无法判断布局和最终定位是否完成。
- 修改文件：`src/ui/turnIntent.ts`、`src/ui/turnIntent.test.ts`、`src/ui/ReaderView.tsx`、`src/render/paginator.ts`、`docs/PROJECT_CONTEXT.md`、`docs/MODULE_CONTRACTS.md`、`docs/PRELOAD_PLAN.md`、`docs/rendering-layers.md`、`docs/tasks/archive/wheel-intent-during-hidden-render.md`。
- 验证：`turnIntent.test.ts` 7/7，新增覆盖小 delta 阈值、正反抵消与 reset；全量 Vitest 13 文件 154/154，`pnpm build` 通过。第一阶段回归仍证明 hidden 时 20 个向下事件只消费一次、`[下, 下, 下, 上]` 以最后方向为准。滚轮目标锁定回归让同一个外层目标每 25ms 持续发事件跨过 hidden→visible：向下由第一章 10/10 跨到第二章并继续至 11/23（1 个 hidden、9 个 visible 事件）；向上由第二章 1/23 跨到第一章末尾后继续至 2/10（1 个 hidden、7 个 visible 事件），不再停在第 2/倒数第 2 页。
- 剩余风险：单槽刻意不保留加载期间的滚轮力度和事件数量，因此非常长的加载也只自动推进一次；display-ready 后仍在发生的锁定滚轮事件会正常连续快进。后续若做移动端手势/惯性动画，应在 P2 单独定义速度与取消语义，不能把加载期缓冲扩成无限队列。
- 关联：C-20、B-015、`docs/tasks/archive/wheel-intent-during-hidden-render.md`。

## B-017：短目录页被 body padding 撑出原生滚动条

- 状态：已修复
- 发现日期：2026-08-17
- 现象：目录内容没有占满一页，iframe 右侧仍出现纵向滚动条。
- 触发条件或样本：`【测试专用】[いのり。].我的推是坏人大小姐.02.epub` 的 `contents.xhtml`；书给 `.contpage` 设置 `padding:1em 0 2em`。
- 根因：阅读器把 `html/body` 固定为 `height:100%`，但没有规定盒模型。该书的 body 仍为 content-box，739px 内容高度再加 16px/32px 上下 padding 后变成 787px，根元素 `scrollHeight=787`，超过 739px iframe；这与正文是否填满无关。
- 约束：不能清零书籍 body padding（C-05 明确保留）；正文仍只由 `#epub-viewer` 分页，不能转回根页面原生滚动；水平 padding 参与既有可用页宽计算。
- 选择的修复：在根页面 L1/L3 契约中给 `html/body` 设置 `box-sizing:border-box`，使书籍 padding 包含在 100% 高度内；同时以 `overflow:hidden!important` 明确禁止根页面原生滚动，实际内容继续由 viewer 多栏分页。
- 为什么这样修：border-box 修正了真实几何，而不是只把滚动条视觉藏掉；overflow 底线防止绝对定位等书籍内容重新启用 iframe 根滚动。书的 16px/32px padding 仍保留，viewer 高度按内容区自然变为 691px。
- 未采用方案：`padding:0!important` 会复发 C-05 并破坏书籍留白；只隐藏滚动条但保持 787px body 会让 viewer 继续越出根盒；按 `.contpage` 或书名处理不能覆盖其他带 body padding 的 EPUB。
- 修改文件：`src/render/sanitize.ts`、`src/render/sanitize.test.ts`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/tasks/archive/toc-overflow-and-dashed-border.md`。
- 验证：先写的合成章节回归在旧实现失败；修复后 `sanitize.test.ts` 47/47、全量 Vitest 13 文件 156/156、`pnpm build` 通过。真实 Chromium 1280×800 中 iframe/html/body 均为 `clientHeight=scrollHeight=739`，body padding 仍为 16px/32px，viewer 为 `clientHeight=scrollHeight=691`，无根页面可滚动溢出。
- 剩余风险：作者若刻意依赖 body 原生滚动将不再生效；这与本阅读器“viewer 独占分页”的既有架构不兼容，属于明确不支持的书籍行为。
- 关联：C-05、C-21、`docs/tasks/archive/toc-overflow-and-dashed-border.md`。

## B-018：目录项虚线与文字在多栏断点被拆开

- 状态：已修复
- 发现日期：2026-08-17
- 现象：目录页底部出现一条没有文字的虚线，而对应目录文字被移到下一页，表现为 `border-bottom:1px #000 dashed` 没有正确跟随条目。
- 触发条件或样本：`【测试专用】[kiki].「凭妳也想讨伐魔王？」被勇者小队逐出队伍，只好在王都自在过活.04.epub` 的 `contents.xhtml`；结构为 `a > div + p`，虚线在 div 上，p 用负上 margin 叠在虚线上。
- 根因：CSS 子组合器和 border 级联均正常：浏览器计算结果始终是 `1px dashed rgb(0,0,0)`。真正问题是默认 inline 的 a 包含两个块级子元素，Chromium 多栏在第 20 条处把同一锚点拆成两列：线位于第一列 `(320,703)`，文字位于第二列 `(1624,35)`，锚点合并矩形横跨 1912px。
- 约束：不能给所有 div/段落统一 `break-inside:avoid`；普通行内链接保持 inline；合法 border 的宽度、线型、颜色和作者负 margin 均不改写；作者明确的 display/break 规则应可覆盖阅读器默认值。
- 选择的修复：增加零特异性 L3 默认规则，只匹配“直接包含常见块级结构元素”的锚点，为其提供 `display:block` 和 `break-inside:avoid`。普通只含文本/span/img 的行内链接不命中；过高、无法容纳一页的链接仍由 CSS fragmentation 规则自然拆分。
- 为什么这样修：链接包裹块级结构本身表达一个可点击的复合条目，将锚点设为块并避免在内部断开比猜测外层 div 类名更通用；零特异性保留 L4 作者规则优先级，也延续 B-011 对页面级块链接的处理方向。
- 未采用方案：改写 border 简写没有作用，因为计算样式早已正确；给所有 div 禁止分页会制造大片空白并误伤正文盒；只匹配 `a>div+p` 过度依赖当前书的结构；用书名/目录类特判不可维护。
- 修改文件：`src/render/sanitize.ts`、`src/render/sanitize.test.ts`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/tasks/archive/toc-overflow-and-dashed-border.md`。
- 验证：先写的不可拆块规则回归在旧实现失败；修复后 `sanitize.test.ts` 47/47、全量 Vitest 13 文件 156/156、`pnpm build` 通过。真实 Chromium 中 27 条目录链接 computed display/break 为 `block/avoid`；断点处第 20 条的虚线和文字一起移到第二列，拆分条目从 1 个变为 0，页数仍为 2，border 仍为 1px dashed 黑色。
- 剩余风险：规则使用现代 Chromium 支持的 `:has()`；当前 WSL Chromium/Tauri 目标满足。若未来支持不具备 `:has()` 的旧 WebView，需要在消毒阶段给块链接打等价标记，而不是删除本规则语义。
- 关联：C-22、B-011、`docs/tasks/archive/toc-overflow-and-dashed-border.md`。

## B-019：小头像 float 被文字收缩补偿错误撑宽

- 状态：已修复
- 发现日期：2026-08-17
- 现象：模拟评论盒中 24px 人物头像与用户名之间出现约 58px 的异常空隙；头像自身纵向位置正常。
- 触发条件或样本：`【测试专用】[あさのハジメ].要是和只对我冷淡的友利同学说『我知道你有隐藏账号』的话会怎么样？.01.[美化版].epub` 第一话；头像位于无显式 width、只含缩进空白与 `img` 的 `float:left` 容器中。
- 根因：C-08 以 computed width 不超过 48px 识别多栏中的文字 shrink-to-fit 塌缩，正常的 27.1875px 头像容器也满足该阈值。Canvas 测量又把 `img` 前后的源码缩进文本当成可见内容累加，最终写入 `width:82.2px`，而浏览器原生宽度应为 24px 图片加 3.1875px 右 padding。
- 约束：保留 C-08 对真实文字气泡的补偿；不按书名、类名或图片 alt 特判；不修改作者的 `float`、负 margin、padding，也不处理本书评论盒的跨栏拆分。
- 选择的修复：在 C-08 Canvas 测量前识别“有效内容只有直接 `img/svg`”的媒体 float；源码格式化空白和注释不视为内容，这类容器保留浏览器原生 shrink-to-fit。只要存在可见文字、其他元素或没有媒体，就继续走原有判断。
- 为什么这样修：替换元素已有可靠的浏览器固有尺寸，不需要文字 max-content 补偿；以内容类别区分正常窄媒体和异常窄文字，比调整 48px 阈值更准确，并使未知书籍中的同结构小头像同样受益。
- 未采用方案：全局忽略空白文本会低估两个 inline 元素间合法的折叠空格；降低宽度阈值会漏掉真实文字塌缩；删除 C-08 会让既有聊天气泡回归；`.twitter-tweet`/`miaotter` 特判不可维护。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/rendering-layers.md`、`docs/tasks/archive/media-only-float-avatar.md`。
- 验证：新增回归在旧实现下 2 项失败；修复后 paginator 9/9、全量 Vitest 13 文件 158/158、`tsc --noEmit` 通过。真实 Chromium 1280×800 中 14 个头像容器均不再被写入 width，computed width 为 27.1875px，头像到用户名间距为 3.1875px，章节仍为 18 页；作者的 `margin-top:-0.2em` 保持 -3.1875px，评论盒拆分数量仍为 4，证明本轮没有改变分页策略。
- 剩余风险：本轮有意只覆盖直接 `img/svg`；若未来出现 `picture` 或多层 inline 包裹的同类误判，应基于新实书扩展“媒体专用”定义，不能递归跳过可能含文字语义的任意容器。
- 关联：C-08、C-23、`docs/tasks/archive/media-only-float-avatar.md`。

## B-020：Windows 批量导入把 EPUB 展开成巨型 JSON 数组

- 状态：已修复，待 Windows 发布包性能确认
- 发现日期：2026-08-17
- 现象：Windows 发布版导入 EPUB，尤其批量导入时，速度远慢于 WSL 浏览器预览且 CPU 占用很高；导入期间书架逐本刷新。重复上传仍完整执行解析、保存和封面覆盖，只是旧进度碰巧被合并保留。
- 触发条件或样本：`<PROJECT_ROOT>/测试用epub/` 中任意多本 EPUB；15.21 MiB 样本的 `Array.from` 本地同类基准增加约 140 MiB JS 堆，JSON 参数约 54.25 MiB。
- 根因：Tauri 存储把正文和封面从 `Uint8Array` 转为普通 `number[]`，再经 JSON IPC 反序列化成 `Vec<u8>`；原生拖放还用 `Promise.all` 一次读入全部文件，导入循环每成功一本就更新 React 书架并立即读回封面。旧重复 ID 仅由 identifier/文件名/大小的 32 位哈希构成，且判重发生在覆盖文件之后。
- 约束：浏览器与 Tauri 保持同一 `ShelfStore` 语义；Rust 继续独占目标路径生成；旧 ID 和书籍目录不能迁移；重复书不能修改文件、进度、首次添加时间或新书状态；内容不同的 EPUB 不应因同名同大小而覆盖。
- 选择的修复：以 EPUB 原始字节 SHA-256 作为新书 ID 和独立 `contentHash`；0.1.5 旧条目只对同大小候选懒读并补录指纹。导入改成逐本读取、指纹判重后才解析保存，批次结束后一次性合并书架。Tauri 文件输入使用 raw body，原生拖放直接复制来源路径，正文/封面先暂存再单次提交索引；存储层提交前再次按指纹拒绝重复。单本重复显示指定红色文案，批量最多展示两个截断书名并在更多时追加“等书”。
- 为什么这样修：内容指纹表达精确重复，不依赖不稳定文件名或不可靠 EPUB identifier；raw IPC/路径复制直接消除主导 CPU 和内存放大；前端预检与后端复检同时保证性能和存储幂等性。
- 未采用方案：继续沿用旧 ID 只能识别同名同大小文件且仍有 32 位碰撞；Base64 仍会扩大正文并增加编码 CPU；启动时扫描整个旧书架会把迁移成本转成每次启动卡顿；内容变化时自动覆盖旧书会混淆版本并带来进度迁移语义。
- 修改文件：`src/App.tsx`、`src/ui/shelf.ts`、`src/ui/importBooks.ts`、`src/ui/importBooks.test.ts`、`src-tauri/src/lib.rs`、协作文档。
- 验证：新增导入纯逻辑 8 项；全量 Vitest 15 文件 170/170、`pnpm build`、Rust 2/2 单测及 `cargo fmt --check` 通过。真实 Chromium 验证单本重复不增书、三本重复只列两个书名并追加“等书”、0.1.5 无指纹条目在改名重传后仍识别且进度不变。Windows WebView2/NSIS 包的绝对耗时仍需用户编译后复核。
- 剩余风险：原生路径从首次读取到 Rust 复制之间若源文件被同大小替换，当前只用长度防变化；这是极小时间窗，若真实出现再让 Rust 同步校验内容指纹。Android 不支持 Tauri raw body，本项目当前目标为 Windows 桌面。
- 关联：`docs/tasks/active/import-performance-duplicates-and-progress.md`、B-021。

## B-021：阅读进度异步写入没有最终顺序与退出保证

- 状态：已修复
- 发现日期：2026-08-17
- 现象：书架阅读进度可能保存失效，重新打开后回到旧章节或旧页；失败没有任何提示。
- 触发条件或样本：快速连续翻页后立即返回书架、刷新或关闭；新书第一次打开时还会同时触发 `markOpened` 与进度更新。
- 根因：每个 ready 状态都独立发起异步 `updateProgress`，没有串行化、同书最新值合并或退出前 flush，返回书架也不等待落盘，异常被静默吞掉。`markOpened` 完成后曾用整条旧返回记录替换 UI，可能覆盖较新的内存进度；Rust 多个变更命令还共用固定 `shelf.json.tmp`，没有写入互斥契约。
- 约束：翻页不能等待磁盘；最后稳定位置必须胜出；章节、页码、百分比、锚点和最近时间保持一致；第一次打开只允许清除 `isNew`；写入失败不能让窗口无提示地关闭。
- 选择的修复：新增单通道 `ShelfProgressWriter`，同一本书在写入进行中只保留最新待写位置，失败在 flush 时重试一次。每次翻页先乐观更新内存书架，再后台写入；返回书架、页面隐藏和 Tauri 关闭窗口时主动 flush。`markOpened` 只合并 `isNew:false`。Rust 所有索引变更通过同一个 `Mutex` 串行，继续用临时索引替换。
- 为什么这样修：写入队列让顺序成为显式契约，既不阻塞翻页也不允许旧请求晚到覆盖新位置；乐观内存更新解决“立即返回再打开”的窗口；退出 flush 覆盖最后一个尚未完成的请求。
- 未采用方案：只增加固定防抖会在窗口关闭前丢掉最后位置；每翻一页同步等待 Rust 会让输入卡顿；只依赖 localStorage 会让浏览器与 Tauri 书架进度继续分裂；仅显示错误而不串行化无法消除旧写覆盖。
- 修改文件：`src/App.tsx`、`src/ui/progressWriter.ts`、`src/ui/progressWriter.test.ts`、`src/ui/shelf.ts`、`src/ui/shelf.test.ts`、`src-tauri/src/lib.rs`、协作文档。
- 验证：进度写入器 3 项覆盖快速翻页合并、跨书顺序和失败重试；书架合并测试证明清除新书标记不覆盖页码/锚点。真实 Chromium 把多页样本读到第 5/11 页、第三章、55%，返回并刷新后仍恢复第 5/11 页；旧条目懒补指纹前后第 4 页、第三章、46% 完全不变。全量 Vitest 170/170、生产构建和 Rust 单测通过。
- 剩余风险：浏览器标签被操作系统强杀时无法等待异步 IndexedDB；正常返回、隐藏、刷新和 Tauri 窗口关闭已覆盖。Windows 安装包关闭事件仍需最终人工确认。
- 关联：`docs/tasks/active/import-performance-duplicates-and-progress.md`、B-020。

## B-022：目录页百分比 margin 被误叠加版心偏移导致翻页异常

- 状态：部分修复，已由 B-023 替代
- 发现日期：2026-08-18
- 现象：《试着向准备跳下去的同班同学提议「和我XX吧！」02》目录页被拆成两页，第二页只有 326px 的右边缘残片。
- 触发条件或样本：目录页末尾 `.ri.ti20er{margin-left:70%;margin-right:1.5em}` 的图片容器。
- 根因：C-16 已能识别 inline style 的水平百分比 margin，但该书百分比写在 `<link>` 样式表的类规则里，`hasPercentageHorizontalMargin(el.style)` 只查 inline style，未命中。于是 margin 修正把 70% 的 `margin-left` 当作“相对居中版心的缩进”，叠加 `base=(parentW-width)/2`，元素被推到 `x=1625`，溢出页宽并产生第二页残片。
- 约束：不改变书籍百分比 margin 的包含块语义；继续保留 C-04 对 em/px 缩进的解释；不能为书名/类名特判。
- 当时选择的修复：新增 `hasPercentageHorizontalMarginInRules(doc, el)`，扫描文档样式表（含 @media）中匹配元素的规则；在当时 WSL Chromium 中能使该书恢复一页。
- 为什么不足：该扫描只是对声明来源的推测，不能代表临时移除 L3 auto margin 后的最终获胜级联；不可读外链样式表还会使负结果不可靠。用户随后仍在实际环境复现两页，故不能继续记为完整修复。
- 未采用方案：仅按 computed px 阈值判断大 margin 会误伤未来以 em 表达的右侧定位；扫描书名类名不可维护；继续只查 inline 会复发。
- 修改文件：`src/render/paginator.ts`、`docs/BUGFIX_LOG.md`、`docs/SOURCE_DELTA.md`。
- 当时验证：全量 Vitest 16 文件 174/174、`pnpm build` 通过；一次 WSL Chromium 测量曾显示该书为 `第 1/1 页`。该证据不足以覆盖用户实际环境，最终验证见 B-023。
- 后续：B-023 改为最终级联的 CSS Typed OM 主路径，并保留安全回退和严格几何兜底。
- 关联：C-16、B-023、`docs/rendering-layers.md`。

## B-023：外链百分比 margin 的 CSSOM 推测在不同 WebView 中不稳定

- 状态：已修复，待用户审核
- 发现日期：2026-08-18
- 现象：`【测试专用】[赤月ヤモリ].试着向准备跳下去的同班同学提议「和我XX吧！」.02.epub` 的目录页仍可能从一页扩展为两页；末页是右侧内容残片。
- 触发条件或样本：目录最后的顶层 `.ri.ti20er`，作者外链 CSS 为 `margin-left:70%; margin-right:1.5em`，元素自身以 inline `width:6em` 定宽。
- 根因：B-022 的样式表扫描不等于最终级联。阅读器 L3 的 `reader-top` auto margin 正在生效时，传统 `getComputedStyle()` 已把作者百分比解析为 px；CSSOM 只能猜测某条匹配规则，外链样式表若不可读还无法给出可靠否定。因此 C-04 在某些环境仍把已相对包含块的左 margin 再加一次版心 `base`，导致越列。
- 约束：不按书名、类名或 `70%` 特判；普通 `margin-left:2em` 版心缩进、C-16 inline 百分比/`calc(...%)`、auto 居中和 C-18 对称 margin 均须保持；作者原位本就越列的布局不得被阅读器伪装成安全布局。
- 选择的修复：`applyBookMargins()` 先仅临时移除阅读器 `reader-top` 的 auto margin（不禁用整张 override sheet，L2 字号等仍稳定），再用 CSS Typed OM 读取最终获胜的 `margin-left/right` 指定值；`%` 和 `calc(...%...)` 直接走 C-16 的包含块原位分支。旧 WebView 无 Typed OM 时才回退 inline/CSSOM；每张 stylesheet 的 `cssRules` 单独捕获，任何不可读表都会把“未发现”保留为未知而不是 false。最终未知时，只有作者原位仍有明确余量、加 C-04 base 才越列、且不是 auto-like 余量，才保留原位。
- 为什么这样修：Typed OM 读取的是实际胜出的 CSS 值而非选择器猜测，能覆盖外链规则、简写和 `calc`；严格几何兜底只防止“阅读器额外 base 造成的新增越列”，不会把普通缩进、已分配的 auto 余量或作者本来就溢出的设计改写掉。
- 未采用方案：继续仅扫描 CSSOM 仍受可访问性和级联时序影响；按计算后的大 px margin 判断会误伤大 em 缩进；直接取消 C-04 会回归既有目录/标题布局；按书名或 `.ti20er` 特判不可维护。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/tasks/active/toc-percent-margin-resilience.md`、`docs/tasks/active/README.md`、`docs/SOURCE_DELTA.md`。
- 验证：新增分页器定向 12/12，覆盖 Typed OM `70%`/`calc(...%)`、不可读 stylesheet、普通 2em、赤月几何、原位越列和非对称 `right:auto` 已解析余量；全量 Vitest 16 文件 177/177、`tsc --noEmit`、Vite 生产构建通过。真实 Chromium：1280×800 时目录为 `第 1/1 页`，viewer `scrollWidth=1270`，目标 margin 为 `889px/24px`；900×650 时为 `第 1/1 页`，`scrollWidth=890`，目标 margin 为 `623px/24px`。
- 剩余风险：不支持 Typed OM 且样式表不可读的旧 WebView 只能依靠严格几何兜底；它故意不覆盖原位无余量、复杂负 margin 或作者本身越列的布局。当前 Windows 发布包仍需用户最终人工复验。
- 关联：C-16、B-012、B-022、`docs/tasks/active/toc-percent-margin-resilience.md`。

## B-024：C-18 的正对称 margin 豁免使目录 Contents 再次贴回版心左缘

- 状态：已修复，待用户审核
- 发现日期：2026-08-18
- 现象：`【测试专用】[relea][zhs][玩具堂]侦探年与敏锐的山田学 包夹我的双胞胎擅自展开推理[01].epub` 的目录页中，彩色 `Contents` 比下方目录条目的竖线明显偏左；同类现象曾在 0.1.2 出现并于 0.1.3 修复，本版回归。
- 触发条件或样本：`TOC.xhtml` 的顶层 `h3.ctt` 使用 `width:auto; max-width:40rem`（阅读器默认）和作者外链 CSS `font-size:2em; text-align:left; margin:1.3em .75em .5em`。1280×800 时当前版把标题放在 x=320，下方 `.toc` 左缘为 x=348；0.1.3 同书标题为 x=344。
- 根因：0.1.3 的 C-04 会把作者 `.75em` 水平 margin 映射为“正文版心左缘 + 24px”。0.1.5 为修复 fit-content 简介盒新增 C-18 后，只要计算后的左右 margin 为相等正值就直接保留 L3 auto 居中，范围超过了原始的 intrinsic-size 灰框，普通目录标题的显式缩进因此再次被吞掉。B-023 的百分比 margin 分支未参与本问题。
- 约束：禁止书名或 `.ctt` 特判；恢复普通 width:auto/固定宽度元素的 C-04 语义；C-18 的 fit/max-content 灰框仍须逐列居中；作者真正的 `margin:auto` 即使计算成 px 也不能被误判为显式对称 margin；B-023 的 70% margin 目录继续保持单页。
- 选择的修复：把“正对称 margin 保持居中”的判断收窄为元素具有 fit/max-content 原始意图（由分页器已有 `fitContentFixes` 和最终计算样式共同判定）。在此之前单独用包含块、border-box 宽度和两侧已解析余量判断真实 auto 居中：只有两侧余量相等且等于 `(parentWidth-width)/2` 才直接保留。其他普通元素即使左右显式 margin 相等，也继续由 C-04 相对正文版心写回。
- 为什么这样修：判据来自通用的 CSS 尺寸意图和实际几何，不依赖书名、标签或类名；它精确保留 C-18 原始目标，同时让 0.1.3 的目录标题行为恢复。auto 与显式相等数值分开判断，也避免固定宽度盒被错误归类。
- 未采用方案：重新取消全部对称 margin 豁免会让 C-18 简介盒错位；按 `.ctt` 或当前书特判不可维护；用 `text-align:left` 区分会误伤大量左对齐但应居中的信息框；把所有相等 margin 当 auto 无法区别作者显式 `margin:1em`。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/tasks/active/toc-symmetric-margin-regression.md`、`docs/tasks/active/README.md`、`docs/SOURCE_DELTA.md`、`docs/PROJECT_CONTEXT.md`。
- 验证：新增 2 项分页 margin 决策回归，先在旧实现下失败；修复后 paginator 14/14、全量 Vitest 16 文件 179/179、`tsc --noEmit`、Vite 生产构建通过。真实 Chromium 1280×800 中标题从 x=320 恢复为与 0.1.3 完全一致的 x=344（书 margin 写回 339px/291px），目录仍为 1/1 页；900×650 为 x=154、1/1 页。C-18 简介盒在 1280×800、900×650 和 20px 字号下所有跨列碎片仍逐列居中且无 margin 写回。B-023 赤月目录 1280×800 仍为 1/1 页、目标 margin 889px/24px、viewer `scrollWidth=1270`。
- 剩余风险：Windows WebView2 发布包尚需用户人工确认；未来若出现非 fit/max-content 但确实希望把显式正对称 margin 仅解释为无方向双侧留白的实书，应依据该书的尺寸/几何语义扩展通用判据，不能重新扩大为“所有相等值”。
- 关联：C-04、C-18、C-24、B-014、B-023、`docs/tasks/active/toc-symmetric-margin-regression.md`。

## B-025：目录可见行内色块被尾随全角空白推过行尾

- 状态：已修复，待用户审核
- 发现日期：2026-08-18
- 现象：`【测试专用】[すめらぎひよこ].世界啊臣服于吾之火焰.01.试着把魔王城点了.epub` 的 `TOC.xhtml` 中目录色块整体错位、部分色块越过目录段落右缘；窄视口时末尾“后记”落到下一列，旧状态还可能显示为单页而无法到达。
- 触发条件或样本：顶层 `.ctit` 右对齐段落中的可见 inline 盒，盒文本尾部含 U+3000/NBSP（可混合普通空格），并有背景、边框或水平 padding。Chromium 1280×800 下父段落右缘为 960px，色块右缘达到 997/1013/1077/1125/1141/1205px；清除父段落 `text-indent` 单独无效。
- 根因：Chromium 在 right/end 对齐行中把手工补齐的不可折叠空白作为 inline 盒外的 hanging whitespace，导致带视觉背景的 inline 盒 `getBoundingClientRect()` 越过其最近块包含段落的 inline-end；多栏分页随后把残余几何扩展成额外列。这是 L5 行内盒测量问题，不是 C-04/C-18 顶层 margin 决策。
- 约束：不得按书名、`.ctit`/`.tbox` 类名或文本特判；普通行内文字、无视觉盒、非 computed-right 对齐、未越界以及行内链接、ruby、脚注语义不能改变；原子化后仍越界或宽度超过包含块必须恢复原值；重排、字号重载、换章和销毁不能留下临时 inline 写回。
- 选择的修复：在分页器测量最后增加通用几何门控：只筛 computed `display:inline`、尾部至少含 U+3000/NBSP（允许其后混合普通空格）、具有可见背景/边框/水平 padding、最近块为物理 `text-align:right` 且真实越过 inline-end 的元素。逻辑 `text-align:end` 暂不命中，因为未结合 direction 不能安全解释 RTL。临时以 `display:inline-block!important`、`text-indent:0!important` 原子化并强制回流；仅当新右缘回到包含块内且新宽度不超过包含块才登记写回，否则立即恢复。保存并恢复原始 inline 值及 priority，并在恢复时移除 per-measure 标记；遍历时先检查尾随空白再取 computed style；跳过元素自身为链接/ruby/脚注语义节点及其 ruby/sup/脚注祖先。
- 为什么这样修：它直接修复浏览器产生越界的行内盒几何，保留作者可见盒尺寸和右对齐语义；只作用于有明确手工补齐空白与视觉外观的真实越界，不扩大到普通正文。用“写回后再次验证”的事务式门控，避免 inline-block 在其他书中继续撑宽或越列。
- 未采用方案：清除所有 `text-indent` 只改变段落首行，实测不能消除色块越界；统一把所有 span/a 改为 inline-block 会破坏行内链接、ruby 和脚注；按 `.ctit`/`.tbox` 或书名特判不可维护；直接取消多栏或改写作者空白会改变正文语义。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/tasks/active/toc-inline-box-overflow.md`、`docs/tasks/active/README.md`、`docs/SOURCE_DELTA.md`、`docs/PROJECT_CONTEXT.md`。
- 验证：分页器定向 19/19；全量 Vitest 16 文件 184/184；`tsc --noEmit`、Vite build 通过。真实 Chromium：目标书 1280×800 所有越界色块右缘回到 960px、宽 249px、目录 1/1；900×650 当前列右缘回到 770px，状态变为可达的 1/2，键盘下一页后显示 2/2，最后“后记”位于第 2 列且已原子化；resize 后标记可恢复并重新写入。B-023 赤月仍 1/1、margin 889/24px；B-024 侦探少年 Contents 左缘 344px、目录 1/1。
- 剩余风险：Windows WebView2 发布包仍需用户人工确认；不支持现代 CSS 几何行为的旧 WebView 可能有不同 inline fragmentation，但门控失败会恢复原值，不会留下半修复状态。一次性 Chromium 脚本和测试书不属于同步内容。
- 关联：C-25、C-04、C-18、B-023、B-024、`docs/tasks/active/toc-inline-box-overflow.md`。

## B-026：书内目录/链接跳转无法撤销

- 状态：已修复，待用户审核
- 发现日期：2026-08-18
- 现象：从目标书第 9 章目录点击 iframe 内第一章链接后，阅读器历史返回按钮仍禁用；同章纯 `#fragment` 跳转也不会进入历史。
- 根因：`ReaderView` 创建 `ChapterPaginator` 的 effect 只依赖 `[book, server]`，构造器回调捕获首次 render 的旧 `onInternalLink`，首次闭包通常仍处于 loading 阶段。纯 fragment 则在 paginator 内直接同步 hash 和定位，没有通知 App。
- 约束：有效普通内部链接和存在目标的 fragment 每次只记录一条跳转前快照，最多保留 10 步；目录、书签不能与 paginator 通知重复入栈；外链、脚注、无效跨章 href 和缺失 fragment 目标不得进入阅读位置历史；回退须恢复章节、页码和内容锚点。
- 选择的修复：App 抽取 `captureReaderHistory(href)` 与只执行 href 的 `navigateReaderHref()`；capture 先以 book/spine 校验跨章目标，目录/书签先捕获再执行。Paginator 普通内部链接先以解析后的 href 调用 `onBeforeInternalNavigate` 再调用路由；fragment 只有目标存在且可 jump 时才通知，缺失目标仍可同步 hash。ReaderView 通过 latest ref 转发两个长生命周期回调，避免旧闭包。
- 为什么这样修：历史快照的责任集中在 App，Paginator 只报告“即将改变阅读位置”，保留分页器对 fragment 的原地定位语义，同时让跨章/同章跳转共享同一撤销链；外链和脚注仍保持各自弹层/系统打开语义。
- 未采用方案：让 paginator 直接维护 UI 历史会复制章节状态并破坏单向编排；把 fragment 强制重载为新章会造成闪现且失去原地 `:target` 行为；仅扩大 effect 依赖会频繁重建 paginator、清空章节生命周期状态。
- 修改文件：`src/App.tsx`、`src/ui/ReaderView.tsx`、`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/MODULE_CONTRACTS.md`、`docs/BUGFIX_LOG.md`、`docs/tasks/active/reader-history-internal-links.md`、`docs/tasks/active/README.md`、`docs/SOURCE_DELTA.md`、`docs/PROJECT_CONTEXT.md`。
- 验证：Paginator 定向 20/20；全量 Vitest 16 文件 185/185；`tsc --noEmit`、Vite build 通过。真实 Chromium：目标书第 9 章目录 → iframe 第一章链接后撤销按钮启用，点击后恢复第 9 章且按钮禁用；选择器测试书同章 fragment 跳转后按钮启用，撤销恢复原页且按钮禁用；无效跨章 href 与缺失 fragment 均保持按钮禁用；单次跨章跳转撤销后无残留第二条历史。
- 剩余风险：Windows WebView2 发布包仍需用户人工确认；书籍内部链接目标是否符合作者预期仍由 EPUB 解析结果决定，当前只保证无效目标不污染撤销历史。
- 关联：`docs/MODULE_CONTRACTS.md`、`docs/tasks/active/reader-history-internal-links.md`、阅读跳转历史和书签任务。

## B-027：自定义 CSS 每字符重载与浅色主题 bgcolor 层级

- 状态：已修复，待用户审核
- 发现日期：2026-08-18
- 现象：自定义 CSS textarea 每输入一个字符都会触发 App 提交和章节重载，造成不必要的分页/CPU 开销；旧实现把浅色书籍 `body bgcolor` 作为位于用户 CSS 之后的 `!important` 规则，压过用户背景，且背景图层级容易被误伤。
- 触发条件或样本：菜单详细设置中的自定义 CSS；含 `<body bgcolor="#8ac9e8">` 的章节，使用普通 `body { background-color:#123456; background-image:... }` 用户 CSS 的合成回归。
- 根因：textarea 直接调用父级 `onCustomCssChange`，每次受控变化都进入 sanitize/reload；旧 sanitize 将安全 `bgcolor` 追加成独立且位于 userCss 之后的 `!important` 规则，必然压住普通用户 CSS；主题若使用 `background` 简写会清掉书籍背景图。
- 约束：保存必须是明确动作，支持清空；父值外部变化须同步草稿；只接受安全颜色；浅色才使用书籍 bgcolor，深色/纸色保持主题；用户 CSS 在同一 override style 最后；不改变背景图；不得实现未设计的多 CSS 预设。
- 选择的修复：MenuPanel 保存本地 draft，只有“保存并应用”且内容变化时调用回调。sanitize 安全解析 bgcolor，浅色把它作为主题 body 的 `background-color` 默认值写入同一 override style，读取后移除 legacy 属性以消费重复来源；用户 CSS 保持末尾，且只写 background-color 不重置 background-image。
- 为什么这样修：提交边界从每字符变为显式保存，避免重载风暴并保留清空语义；同一 style 的自然级联让普通用户规则覆盖浅色默认值，同时不需要全局 `!important`；移除的仅是已消费的 legacy 背景色提示，书籍其余样式和背景图仍保留。
- 未采用方案：debounce 仍会在编辑时重载且关闭时机不明确；blur 自动保存不可发现；追加 bgcolor `!important` 会阻止用户 CSS；使用 `background` 简写会清除背景图；多个 CSS 预设留待 schema/UI CRUD/旧值迁移设计。
- 修改文件：`src/ui/MenuPanel.tsx`、`src/ui/menuPanel.test.ts`、`src/render/sanitize.ts`、`src/render/sanitize.test.ts`、任务与契约文档。
- 验证：全量 Vitest 17 个文件 186/186，`tsc --noEmit`、Vite build 通过。真实 Chromium 连续输入 5 字符期间 iframe load=0，保存一次 load+1，清空保存再次 load+1；无强制作者规则的测试章节浅色 computed 背景为 `rgb(18,52,86)`且背景图保留，深色/纸色清空后分别为 `rgb(30,30,30)`/`rgb(244,236,216)`。
- 剩余风险：作者 CSS 自己声明 `background-color: !important` 时仍按 CSS 优先级胜出，这是有意保留的书籍规则语义；Windows WebView2/安装包仍待用户确认。
- 关联：C-01、`docs/tasks/active/custom-css-commit-and-theme-bgcolor.md`。

## B-028：工具栏窄窗口标题侵入控件

- 状态：已修复，待用户审核
- 发现日期：2026-08-18
- 现象：工具栏使用 `1fr minmax(0,42%) 1fr` 时，窗口变窄后左侧按钮实际内容超过分配列；由于左右容器允许溢出，按钮会侵入标题区域。标题两行布局在窄屏也不能显示标准省略号。
- 触发条件或样本：阅读器工具栏，1080×760 与 640×480，UI scale 1 与 1.3；长书名和短书名均检查。
- 根因：左右 grid track 是可被压缩的 `1fr`，而按钮组有不可压缩的实际内容宽度；标题列固定占 42% 并不能代表剩余空间。单纯使用不对称 `max-content` 侧轨又会让可完整显示的标题偏离窗口中心。
- 约束：左右功能按钮不得隐藏或裁切；标题不得与按钮重叠；宽屏保留两行；窄屏变为单行省略；字号继续使用 `clamp(9px,1.05vw,13px)` 且不低于 9px；不改变正文标题或 EPUB CSS。
- 选择的修复：Toolbar 用 `ResizeObserver` 测量左右控件的实际 layout `scrollWidth`，取最大值写入对称 `--toolbar-side-width`，宽屏使用对称侧轨和可收缩中间轨；720px 以下切回不对称 `max-content minmax(0,1fr) max-content`，让按钮在 ellipsis 模式下完整留在视口内。标题同时切换为 block、nowrap、hidden、ellipsis，保留 `title` 属性查看完整标题。
- 为什么这样修：布局约束直接来自控件真实宽度，不依赖按钮数量或书名；宽屏两侧取相同最大宽度使标题中心稳定，窄屏放弃不必要的居中要求换取按钮完整可用，只有标题可收缩且省略行为符合 CSS 标准。
- 未采用方案：继续使用三列 `1fr` 会在不同 UI scale 下复发；全局缩小或隐藏按钮损害可用性；修改 EPUB 正文标题与本 UI 问题无关；按某一本书名设置断点不可维护。
- 修改文件：`src/ui/Toolbar.tsx`、`src/styles.css`、`docs/MODULE_CONTRACTS.md`、`docs/BUGFIX_LOG.md`、`docs/tasks/active/toolbar-narrow-layout.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md`、`docs/SOURCE_DELTA.md`、`docs/PROJECT_CONTEXT.md`。
- 验证：Chromium 1080×760 宽屏标题中心与 toolbar 中心差 0px（scale 1/1.3），书架“EPUB 阅读器”中心差 0px；640×480 窄屏与 UI scale 1/1.3 均无控件-标题矩形交叠且按钮可见，computed `nowrap`/`ellipsis`/9px，合成超长标题分别为 `439 > 315`、`472 > 171`。全量测试、tsc、Vite build 见任务收尾记录。
- 剩余风险：极端窄于所有功能按钮总宽时 toolbar 可能需要水平空间，但不会用隐藏/裁切制造假可用性；Windows WebView2 仍需用户最终确认。
- 关联：`docs/tasks/active/toolbar-narrow-layout.md`、UI 工具栏契约。

## B-029：CSS 注释内容参与资源与尺寸改写

- 状态：代码、自动化回归与 Chromium 端到端已完成，待用户审核/同步
- 发现日期：2026-08-18
- 现象：CSS 注释中的可读 `@import`、`url()`、`width` 或 `float` 文本会被正则扫描；可读注释 import 甚至可能泄漏导入 CSS 为有效规则，注释关键词还会误导 sanitize 的祖先定宽/纯图片判断和 paginator 的 float guard。引号字符串中的 `/*...*/` 不应被视为注释。
- 根因：`cssRewrite.ts` 的 import/url/width pass 直接扫描原文，递归导入又会在子调用中恢复注释后重新暴露给父级；sanitize/paginator 的若干来源启发式也直接对 style 文本使用正则。
- 约束：只识别 normal state 的 CSS block comment；引号内 `/*`、反斜杠转义和未闭合注释必须保持字符串/注释语义；注释原文逐字保留；注释内 import 不读取、不生成活动 URL；不改变 CSSOM/Typed OM 与 userCss 注入。
- 选择的修复：新增 quote-aware comment protector，根调用与递归 `@import` 共享 token context，统一在根返回前恢复；资源与 width 扫描只作用于保护文本，inline style 使用同一边界的专用 width helper；sanitize 的 authored width/size 和 paginator float guard 统一使用去注释来源判断。
- 未采用方案：不引入完整 CSS parser；不修改浏览器 CSSOM、Typed OM 或自定义 CSS 注入，以免改变作者/用户 CSS 级联和性能边界。
- 修改文件：`src/render/cssRewrite.ts`、`src/render/cssRewrite.test.ts`、`src/render/sanitize.ts`、`src/render/sanitize.test.ts`、`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/tasks/active/css-comment-boundaries.md`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md`、`docs/PROJECT_CONTEXT.md`。
- 验证：定向 96/96；全量 Vitest 17 文件 197/197；`tsc --noEmit`、Vite build 通过。WSL Chromium sanitize 外链 CSS 端到端验证 `hiddenReads=0`，重写 CSS 逐字保留 `/* @import "hidden.css"; */`，活动 `.real` 背景 URL 为 `blob:test/OEBPS/Styles/active.png`，CSSOM 仅保留 `.real`，hidden 为 `rgb(0,0,0)`，real 为 `rgb(0,0,255)`。自动化覆盖注释 import 不读取/不泄漏、递归注释、未闭合注释、quoted URL、占位符碰撞、width/float/sanitize 边界；剩余为现有测试书普通回归与 Windows WebView2/安装包确认。
- 剩余风险：保护器是有限 CSS 文本扫描器，不替代完整 parser；极端非法 CSS 仍以浏览器解析为准。Windows WebView2 仍待用户确认。
- 关联：`rendering-layers.md` C-27、`docs/tasks/active/css-comment-boundaries.md`、CSS rewrite/sanitize/paginator 契约。

## B-030：末尾媒体浮动装饰跨列拆分

- 状态：代码、自动化回归与 WSL Chromium 实书验证已完成，待用户审核/同步
- 发现日期：2026-08-18
- 现象：`【测试专用】[七菜なな].男女之间存在纯友情吗？（不，不存在！）.03.epub` 的 `contents.xhtml` 在 900×650 下末尾 `.fr` 浮动纯图片装饰被拆到下一列，产生错误第二页；title.xhtml 的整页 wrapper 差异本轮仅诊断，未修改。
- 根因：跨列元素的 `getBoundingClientRect().bottom` 是碎片 union，约等于 content bottom，不能代表未分片内容底部；目标 `.fr` 首列 top 约 476px、scrollHeight 约 187px，实际未分片底部约 663px，溢出约 134px。候选子图的负 margin 还可能使后代视觉 rect 比浮动根节点更靠左，单看根节点会漏掉越界/碰撞。
- 约束：不得按书名、类名或文本特判；仅处理 viewer 最后一个直接子元素、static/relative 的 left/right float、递归媒体-only 子树；普通文字 float、非媒体子树、已有单列或安全布局必须不写回；重排和销毁必须恢复临时 inline 值及 priority。
- 选择的修复：分页器在 float 宽度收缩后、最终 extent 前，以首个内容列碎片 top + 正 `scrollHeight` 估算未分片底部；临时写入 `margin-top = computed margin-top - overflow - 1px`，强制回流后要求候选自身合为单列、候选及后代所有视觉 rect 在该列内容区内、底部不越 content bottom、且不与此前顶层兄弟及后代实质交叠。列坐标考虑 `viewer.scrollLeft`；门控失败事务式恢复，measure/dispose 都恢复成功写回。
- 为什么这样修：它针对 Chromium 多栏对末尾纯媒体 float 的具体 fragmentation 测量错误，保留媒体相对目录的自然位置，并把子图的真实视觉边界纳入安全检查；递归媒体判断和几何门控均为通用条件，不引入书籍特判。
- 未采用方案：用 union rect bottom 判断会漏掉目标溢出；只检查 `.fr` 自身会漏掉负 margin 子图；把所有末尾 float 上移会破坏普通文字/非媒体设计；修改 title wrapper 或强制整章减高超出本 Bug 范围。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/MODULE_CONTRACTS.md`、`docs/tasks/active/trailing-media-float-overflow.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md`、`docs/SOURCE_DELTA.md`、`docs/PROJECT_CONTEXT.md`。
- 验证：分页器定向 23/23；全量 Vitest 17 文件 199/199；`tsc --noEmit`、Vite build 通过。真实 Chromium 目标书 900×650 为 1/1，`.fr` margin-top `-134.647px`；1280×800 为 1/1 且 margin-top `0px`；640×480 为 1/2，剩余跨列来自目录主体本身。B-019、B-023、B-024、Sumeragi 900×650 实书回归均为 1/1，未见分页异常。
- 剩余风险：640px 极窄视口的目录主体仍可自然跨两列；Windows WebView2 发布包仍待用户确认。title.xhtml whole-page wrapper 仅记录为诊断结果，若需改变应另行评估。
- 关联：`rendering-layers.md` C-30、`docs/tasks/active/trailing-media-float-overflow.md`、C-08、C-23。

## B-031：100 本以上书库复制正文并全量刷新导致高资源占用

- 状态：实现与自动化验收完成，待 Windows 发布包性能验证
- 发现日期：2026-08-20
- 现象：Windows 发布版导入大量 EPUB 时显著慢于 WSL 预览，CPU 与内存占用偏高；书库超过 100 本后，启动、批量导入和书架刷新成本继续随正文总量及卡片数量放大。用户书库可能达到十几 GB，复制每本正文还会造成应用数据目录持续膨胀。
- 根因：旧桌面书库把 EPUB 正文和封面复制到应用目录；批量导入仍需把大块字节送入 WebView/解析链，书架卡片又会在导入状态和全局时钟变化时重复渲染，并可能为离屏卡片读取/解码封面。可同步进度、设备路径、正文副本和封面缓存没有清晰分层。
- 约束：桌面版不得复制或删除用户源 EPUB；精确重复仍按完整字节 SHA-256；改名/重新导入不得丢进度；存档可跨平台但绝对路径不得同步；源文件缺失必须保留记录并可安全重新定位；旧测试书库无需迁移。
- 选择的修复：新增 Rust 链接书库，将 `LibraryRecord`、`DeviceBinding` 与 Thumbnail 分层；批量路径导入在 Rust 侧流式哈希并只读取受限 container/OPF/加密/封面定位元数据，整批集中提交索引和 UI。启动先 stat，只有签名变化才重哈希；打开和重新定位再次验证内容身份。书架卡片 memo 化，离屏布局使用 `content-visibility`，封面只在接近视口时经四并发队列派生最大 240×360 缩略图，设备 LRU 上限 100 MiB，并在启动清理索引外孤立文件/临时文件。新增不含路径的 v1 存档与缺失源文件重新定位流程；每本书首次稳定进度立即写，后续 750 ms 合并并在生命周期边界 flush。
- 为什么这样修：书库总容量不再转化为应用数据正文副本，启动成本主要是记录读取与文件 stat，滚动封面成本由接近视口的卡片决定；同时保留内容哈希身份，跨平台同步只需传递小型状态存档。
- 未采用方案：继续复制正文即使分批也无法解决十几 GB 双份占用；每次直接从 EPUB 解码原封面会让滚动与重启持续支付 ZIP/大图解码成本；只保存源路径而没有内容哈希会把旧进度误套到被替换文件；本轮不引入云同步，也不为单个 10GB EPUB 改造随机访问解析器。
- 修改文件：`src-tauri/src/linked_library.rs`、`src-tauri/src/lib.rs`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/capabilities/default.json`、`src/App.tsx`、`src/ui/shelf.ts`、`src/ui/ShelfView.tsx`、`src/ui/progressWriter.ts`、`src/ui/libraryArchive.ts`、`src/ui/libraryArchiveBridge.ts`、`src/ui/thumbnail.ts`、对应测试、`src/styles.css`、`package.json`、`pnpm-lock.yaml` 及交接文档。
- 验证：`pnpm test` 21 文件 218/218；`pnpm build`（TypeScript/Vite）通过；`cargo fmt --check`、`cargo check --quiet` 通过；Rust 9/9。自动化覆盖桌面命令契约、存档路径泄漏拒绝/合并、每本书首次进度立即提交及在途更新不丢失、缩略图尺寸/并发/取消与孤立缓存文件识别、哈希与记录校验。旧 WSL/Windows `dev.epubreader.app` 缓存目标均不存在，无内容需要删除。
- 剩余风险：仍需 Windows 发布构建用 100+ 本和数 GB 书库记录实际导入、重启、滚动、内存与 CPU；Tauri 系统文件选择/拖放、存档读写、重新定位和卸载行为也需人工确认。单本打开仍由现有前端解析器完整读取，不承诺单个超大 EPUB 的随机访问。两份 JSON 只能分别原子替换；极窄崩溃窗口下绑定会保守失效为 unavailable，记录可由存档恢复。
- 关联：`docs/tasks/active/linked-library-refactor.md`、存储契约、B-020、B-021。

## B-032：桌面应用可被重复启动

- 状态：代码与 Rust 回归完成，待 Windows 桌面实机确认
- 发现日期：2026-08-20
- 现象：用户在桌面版已经运行时再次启动应用，系统可能创建第二个独立进程和窗口；已最小化的原窗口也不会自动回到前台。
- 触发条件：Windows 安装包或 Tauri 桌面开发版运行期间，再次从可执行文件/快捷方式启动。
- 根因：Tauri builder 没有注册进程间单实例协调；前端浏览器状态无法可靠承担桌面进程互斥。
- 约束：保持 Tauri 2；浏览器 `pnpm dev` 多标签页开发不受影响；第二个进程不得触碰书库或进度；恢复已有窗口不能因窗口暂时缺失或单步平台调用失败而 panic。
- 选择的修复：使用官方 `tauri-plugin-single-instance`，仅为 desktop target 引入，并作为 builder 的第一个插件注册。插件关闭第二实例时回调已有实例，按 `show`、`unminimize`、`set_focus` 顺序尽力恢复 `main` 窗口，单步错误均忽略。
- 为什么这样修：官方插件在桌面平台提供进程间协调，早于其他插件初始化可避免启动期干扰；窗口恢复属于 Rust 外壳，既不污染浏览器开发路径，也不需要前端自制锁。
- 未采用方案：不使用 localStorage/IndexedDB 锁，因为它不能阻止独立桌面进程；不自行编写命名 mutex/IPC，因为会重复跨平台插件已经处理的生命周期与平台细节；不让第二实例转发参数或深链接，本任务未定义参数路由语义。
- 修改文件：`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/src/lib.rs`、`docs/tasks/active/desktop-single-instance.md`、`docs/tasks/active/README.md`、`docs/MODULE_CONTRACTS.md`、`docs/SOURCE_DELTA.md`、本文。
- 验证：`cargo fmt --check`、`cargo test`、`cargo check` 通过；Rust 回归固定恢复顺序。Windows 双启动（普通、原窗口最小化）仍需用户在 Tauri dev 或发布包人工确认。
- 剩余风险：Linux Snap/Flatpak 需要额外 DBus manifest 配置才可用；项目当前发布目标是 Windows NSIS。Windows 的前台激活策略由系统控制，`set_focus` 只能尽力请求焦点。
- 关联：官方 Tauri Single Instance 插件、`docs/tasks/active/desktop-single-instance.md`、桌面外壳契约。

## B-033：阅读跳转历史首次漏记与恢复位置不稳定

- 状态：代码与自动化回归完成，待用户审核
- 发现日期：2026-08-20
- 现象：首次打开后立即执行目录/书内链接跳转时，ready state 仍可能停留在 React 闭包旧值，导致第一条历史漏记；原实现只有 10 条后退历史，后退后无法前进；初始锚点恢复后旧页码还可能覆盖锚点定位。长书连续翻页时，若取整后的进度百分比未变，书架进度也可能不触发更新。
- 根因：分页器 ready 与 display gate 解除之间，App 的异步 `chapterState` 尚未完成 render；历史仅有单向数组；页码与内容锚点由两个独立入口同时恢复；书架写入副作用只间接依赖整数 `progressPct`；Toolbar 保留了书架态的旧侧轨宽度，新增的嵌套胶囊又可被 flex 收缩，因而会被相邻按钮覆盖点击区。
- 选择的修复：新增纯 TS 三项上限 back/forward 状态机；App 增加同步 chapter state/ref、稳定位置基线与每个稳定位置单次捕获门，初始加载期目录跳转也可以已保存基线入栈；ReaderView 转发 paginator 最终 display-ready，同章 fragment 则在同步定位后另行通知 settled；所有换章/显式导航在门控期间禁止进度写入；写入触发包含实际 `chapterState`；有 anchor 时不再套用 page fallback；Toolbar 以子控件的 intrinsic scroll width 重测侧轨，胶囊禁止 flex 收缩。
- 修改文件：`src/ui/readerNavigationHistory.ts`、`src/ui/readerNavigationHistory.test.ts`、`src/App.tsx`、`src/ui/ReaderView.tsx`、`src/render/paginator.ts`、`src/render/paginator.test.ts`、`src/ui/Toolbar.tsx`、`src/styles.css`、本任务文件及契约/交接文档。
- 验证：历史/paginator/progress writer 定向 31/31；全量 Vitest 22 文件 221/221；`tsc --noEmit` 与 Vite 生产构建通过。WSL Chromium 确认初始 ready 前目录跳转入栈、连续两次 fragment 后一次后退仍可再后退、前进可用，且胶囊含 2 个可点击按钮。Windows WebView2 人工确认待用户执行。
- 关联：`docs/tasks/active/reader-navigation-history-forward.md`、UI 稳定 display-ready 契约。

## B-034：目录顶层 float 逃逸 40rem 版心

- 状态：代码与自动化回归完成，待用户审核
- 发现日期：2026-08-20
- 现象：目标书 `contents.xhtml` 末尾直接子 `.fr` 的 computed `float:right` 在宽视口贴窗口右缘；1280 viewer 为 x=1200..1280、900 viewer 为 x=820..900，未落在居中的 40rem 版心右缘。
- 触发条件或样本：`【测试专用】[七菜なな].男女之间存在纯友情吗？（不，不存在！）.03` 的目录页；该元素作者水平 margin 为 0、宽约 80px。640px 以下窄容器的自然布局与第二页不是本 Bug 目标。
- 根因：L3 `.reader-top` auto margin 在顶层 float 上不能提供预期版心内缩，Chromium 将无作者 margin 的 float 贴到全宽 viewer 物理边缘；原 `applyBookMargins` 没有该类安全分支。
- 约束：只处理 viewer 直接 `reader-top`、computed `left/right` float、非全页类、宽度不超过 40rem 且作者无 meaningful 水平 margin 的元素；作者明确全宽/突破版心意图、全页布局和过宽盒保守跳过；不得按书名或 `.fr` 特判；不改 B-030 垂直补偿。
- 选择的修复：新增 DOM-independent 的 `getReaderTopFloatContainmentMargins` 门控；宽容器给 float 物理侧写入 `max(0,(parentWidth-min(parentWidth,40rem))/2)`，另一侧为 0，窄容器写入 0/0。`applyBookMargins` 在百分比、fit-content/max-content 分支之后调用它，并通过现有 `marginFixes` 保存和恢复 inline 值及 priority；仅对 author stylesheet 中明确的 `width/min-width:100%` 或 viewport-relative 表达式保守跳过，排除 reader 注入 stylesheet，未知条件不推断。
- 为什么这样修：它直接复用现有 reader-top 两阶段级联测量与 margin 生命周期，只改变确认逃逸的页面级 float；不重写书籍 DOM，也不会把普通嵌套 float 或明确出血设计拉回版心。
- 未采用方案：不全局覆盖 float 或强制所有顶层元素 40rem；不按 `.fr`/书名特判；不改变 title.xhtml whole-page wrapper；不修改 C-30 的垂直 margin-top 补偿。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/MODULE_CONTRACTS.md`、`docs/tasks/active/toc-top-float-containment.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md`、`docs/SOURCE_DELTA.md`、`docs/PROJECT_CONTEXT.md`。
- 验证：paginator 定向 28/28；全量 Vitest 22 文件 226/226；`tsc --noEmit` 与 Vite build 通过。目标书 Chromium：1280、900 均为 1/1，目录图片分别收回约 x=864..952、674..762；640 保持自然 2 页且第 2 页图片位于可见范围。玩具堂 1280/900 标题左缘仍为 344px/154px，赤月 70% margin 仍为 1/1，すめらぎ resize 前后内联盒均未越界。
- 剩余风险：作者全宽意图扫描是有限 CSSOM/文本启发式；Windows WebView2 仍待最终确认。
- 关联：`rendering-layers.md` C-31、`docs/tasks/active/toc-top-float-containment.md`、C-04、C-30。

## B-035：图片脚注弹层泄漏注释序号

- 状态：代码与自动化回归完成，待用户审核
- 发现日期：2026-08-20
- 现象：`[简][初鹿野創].有谁规定了在现实中不能有恋爱喜剧的？.03.epub` 的 `Postscript.xhtml` 中，点击图片脚注后，弹层除了注释图片和文字，还显示了 `019`/`020` 等注释序号。
- 触发条件或样本：`aside > a > ol.duokan-footnote-content > li.duokan-footnote-item[value="019"]` 的多看图片脚注结构；正文 iframe 内序号被书籍 CSS 隐藏，但弹层属于宿主 UI。
- 根因：`resolveFootnote()` 为图片注释复制整个 `aside.innerHTML` 到 `FootnotePop`。复制后的富 HTML 离开书籍 iframe，不再继承书籍 `aside ol { list-style:none !important; }`；宿主 `.footnote-html ol` 只设置了 `padding-left:20px`，浏览器遂按 `<li value="019">` 生成默认有序列表 marker。
- 约束：不改变脚注识别、正文 DOM 或 `footnotes.ts` 的 HTML 结构；只修复宿主弹层的展示语义；普通脚注中的作者有序/无序列表仍保留编号；图片应回到卡片内容边缘，不能继续为隐藏的 marker 留负缩进。
- 选择的修复：在宿主 CSS 中仅匹配 `.footnote-html ol.duokan-footnote-content` 及其直接 `li`，隐藏列表 marker 并将该列表 `padding-left` 置零；仅对该结构直接 `li > div > img` 的图片容器覆盖原有 `margin-left:-20px`，嵌套作者列表与普通列表保持原有编号和图片缩进。
- 为什么这样修：问题来源是书籍 CSS 语义跨 iframe 到 UI 弹层时丢失，结构类名是稳定的多看脚注契约；定向宿主 CSS 能覆盖当前和同类 EPUB，不会用书名/注释编号特判，也不会破坏普通列表。
- 未采用方案：不在 `resolveFootnote()` 中删除 `<ol>/<li>` 或 unwrap DOM，避免破坏注释内链接和排版；不全局隐藏 `.footnote-html ol`，避免误伤真正的有序列表；不修改书籍 iframe CSS，因为正文中原样式已经正确。
- 修改文件：`src/styles.css`、`src/ui/footnoteStyles.test.ts`、`docs/tasks/active/footnote-rich-content-marker.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md`、`docs/PROJECT_CONTEXT.md`、`docs/HANDOFF.md`。
- 验证：脚注 CSS 契约 2/2；定向脚注/样式/消毒/分页 91/91；全量 Vitest 23 个文件 228/228；`tsc --noEmit`、Vite production build 通过。WSL Chromium 实际点击目标书两个图片脚注：`019`/`020` 的 computed `list-style-type:none`、padding `0px`，图片、列表项和弹层内容左缘一致；Windows WebView2 待人工确认。
- 剩余风险：宿主 CSS 仅覆盖带 `.duokan-footnote-content` 类的多看列表；其他厂商使用不同 class 且同样依赖 iframe 内 `list-style:none` 的结构，需以后续样本按同一原则扩展。
- 关联：`rendering-layers.md` C-32、`docs/tasks/active/footnote-rich-content-marker.md`、脚注解析与 UI 弹层契约。
