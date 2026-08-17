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
