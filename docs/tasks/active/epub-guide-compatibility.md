# 任务：EPub 指南兼容性修复

- 状态：代码、自动化与 WSL Chromium 完成，待用户/Windows WebView2 审核
- 创建日期：2026-08-20
- 最后更新：2026-08-20
- 对应 Bug：B-041～B-047

## 目标

修复《EPub 指南——从入门到放弃》中已确认由阅读器渲染规则造成的四类兼容性问题，并为每类问题建立独立、可回归的证据。

## 非目标

- 不修改私有测试 EPUB、按书名/章节名写特判，或扩大为通用 CSS 重构。
- 不改变阅读器现有纯图片页、显式全页图、内联 SVG、目录解析、float 或 margin 补偿以外的行为。

## 当前现象与证据

- 3.1：带图片和 `.duokan-image-maintitle` 图注的 `.duokan-image-single` 被注入的全页图 CSS 强制为 `height:100%` flex 布局，图注被挤压。
- 3.4.4：连续百分比 float 与 C-31 单项版心内缩冲突，已由 B-042 增加组级保守豁免。
- 目录：有效 EPUB 3 NAV 已解析；fragment-only 项、混合多级树、递归统计与同文档 fragment 唯一高亮已由 B-043 修复。
- 8.6.5：blockquote 的 UA 40px 默认 margin 曾被 C-04 当作作者 margin；B-044 来源门控消除了错误右移，但也吞掉了 UA 双侧缩进，B-045/C-38 已将其转换为保持居中的有效宽度缩减。

## 已确认根因

本阶段（B-041）：`sanitize.ts`、`paginator.ts` 和 `cssRewrite.ts` 都把类名 `.duokan-image-single` 本身等同于显式全页图；但该类同时用于普通正文图与图注容器。页面级 `isPlainImagePage` 已能凭无文本、单图结构识别真正纯图片章节，因此不需要由该类名承载全页语义。

## 必须保持的行为

- 无文字、单张未限宽图片的页面继续进入 `fullpage-image`。
- `.duokan-image-fullscreen`、`.illus`、`.kuchie`、`.cover` 的明确全页图语义保持。
- B-013 的单 SVG + direct image 纯图片页保持整页 contain。

## B-042：3.4.4 连续百分比 float

- 状态：代码、自动化与 WSL Chromium 完成，待用户/Windows WebView2 审核。
- 根因：C-31 原先逐个处理 viewer 直接 `reader-top` float；五个同向 `width:20%` float 是作者横向栅格，却被逐项写入同样的版心侧 inset。
- 方案：先由 C-35 识别真实直接 sibling 组；安全组的限宽事务在 B-046/C-39 执行，C-35 的识别和复杂组保守回退边界保持不变。
- 回归：旧实现 36 通过/5 失败；级联边界补测后 paginator 48/48，`tsc --noEmit` 通过。覆盖 20×5、50×2、33.333×3、单个 70%、20×2、px/% 混合、方向/普通块/clear 断组、Typed OM 最终 px/无值、inline important/stylesheet 覆盖、reader overrides、复杂伪类、未知 CSSOM、最终 CSSOM 级联。整组收尾 Vitest 34 文件、304 测试、`tsc --noEmit` 与 `pnpm build`（95 modules）均通过；无 Rust 改动，未运行 cargo。
- Chromium 复核：详见 B-046；本节只记录 C-35 的组识别边界，不再宣称安全组保持全 viewer 宽度。

## B-046：顶层浮动布局单元与完整百分比组版心限宽（C-31/C-39）

- 状态：代码、自动化与 WSL Chromium 完成，待用户/Windows WebView2 审核。
- 方案：第一阶段先让所有 viewer 顶层 left/right float 与 C-04/C-18 隔离；安全单项在 float 侧叠加 40rem 版心 inset 并保留作者 margin，复杂单项只写回原始布局。第二阶段仅接受连续 viewer 直接子、同向 float、`clear:none`、明确 `0<p<=100` 且总和 99..101、static/relative、horizontal-tb/ltr、非 fullpage/fullwidth、水平 computed margin 有限且近零的完整组；各成员宽度按父容器百分比与 40rem 对应比例中的较小值计算为本轮 px，首项承担同侧版心 inset。事务性几何验收失败时完整恢复 width/margin/priority/marker并保留作者 float。C-08 不重复修改已标记成员；`floatLayoutFixes` 独立保存并在重排/dispose 恢复。
- 验证：paginator 62/62，全量 Vitest 34 文件、312/312，`tsc --noEmit` 与 `pnpm build`（95 modules）通过；3.4.4 1280×800 五块各 128px、整组 `x=320..960`、4 页可达，900×650 各 128px、整组 `x=130..770`、5 页可达；字号 16→20→16 时宽度 128→160→128，未累积临时样式。900×650 与 1280×800 的金木犀目录 float 右缘分别为 738/928（版心右缘减作者 2em），2 页均可达。相邻赤月保持 1/1；玩具堂、头像媒体与其他已登记样本未见 viewer 横向溢出。
- 约束：不按书名/类名特判，不包 DOM，不改 C-35 复杂组回退，不运行 Rust/cargo；Windows WebView2 仍待人工确认。

## 预计修改文件

- `src/render/sanitize.ts`：解除普通 `.duokan-image-single` 的强制全页样式与 fullpage 判据。
- `src/render/paginator.ts`：解除仅由该类触发的 fullpage 候选排除与 fit-content 跳过。
- `src/render/cssRewrite.ts`：允许普通该类容器遵循已有通用 width 语义。
- 对应单元测试和本任务文档。

## 实际修改

- B-041：从 sanitizer 强制全页 CSS、fullpage 祖先判据、CSS width 改写跳过表和 paginator 的类级全页排除中移除 `.duokan-image-single`；明确 fullscreen 类与页面级纯图片检测不变。
- 新增普通图文容器、明确 fullscreen 容器、纯单图和 B-013 SVG 的回归边界；普通容器的直接 `width:100%` 现在进入既有 `min(100%, 40rem)` 规则。

## 验收标准

- [x] 图文 `.duokan-image-single` 不再获得全页 height/flex/图片 `width/height:100% !important`。
- [x] 纯单图、明确 fullscreen 类和 B-013 SVG 用例均保持全页行为。
- [x] 定向 Vitest 与 TypeScript 检查通过。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| 新增回归在旧实现下运行 | 2 项失败：普通 single 仍跳过 width 改写，仍获得强制全页 CSS | 2026-08-20 |
| WSL Node + `vitest run src/render/sanitize.test.ts src/render/cssRewrite.test.ts src/render/paginator.test.ts` | 3 文件、114/114 通过 | 2026-08-20 |
| WSL Node + `tsc --noEmit` | 通过 | 2026-08-20 |
| 目标 EPUB Chromium，3.1，1280×800（主审查） | 1/4 页、viewer `fullpage=false`；两个普通 single 均为 `display:block`、宽 650px、高 302/387px，无 `data-reader-margin-fixed`；图片 441×253/624×338，图注均宽 640px、在图片下方且未越界 | 2026-08-20 |
| WSL 全量收尾 | Vitest 34 文件、304 测试通过；`tsc --noEmit` 通过；`pnpm build`（95 modules）通过。未修改 Rust，未运行 cargo | 2026-08-20 |

## 不应同步的本地文件

- 私有测试 EPUB、Chromium 截图、临时诊断脚本和浏览器产物。

## 待完成与风险

- B-041～B-047 的代码、自动化与 WSL Chromium 均已完成。本阶段不为普通图新增新的全页 marker，也不按 blockquote 标签或目录类名特判；剩余仅为用户审核、Windows WebView2/发布包实机验证与用户同步，不归档本任务。

## B-043：EPUB 3 NAV fragment 与多级目录

- 状态：代码、自动化与 WSL Chromium 完成，待用户/Windows WebView2 审核
- 发现日期：2026-08-20
- 现象：目标书的 EPUB 3 NAV 已被优先识别，但 nav 文档中的 fragment-only 条目被置灰；父级 `li` 可能误取嵌套条目的第一个链接；混合 `ol/ul` 或 div 包装时层级/文档顺序不稳定；目录头只显示顶层数量，且同一 XHTML 的多个 fragment 会同时高亮。
- 根因：`epub:type` 读取只依赖前缀属性；`parseLi` 用全子树第一个 `a` 与把所有 `ol` 再所有 `ul` 拼接的方式，越过了嵌套列表边界；fragment-only href 没有 nav 基准上下文；UI 只比较路径并只统计顶层节点。
- 约束：保留 `isUsableHref` 在无上下文时拒绝纯 fragment；仅当 nav/NCX 基准文档属于 spine 时解析 `#`/`#id`；不改变 NAV 优先于 NCX 的策略，不改变分页/历史状态机。
- 选择的修复：使用命名空间/前缀/local-name 多级回退读取 `epub:type`；以最近列表搜索和嵌套 li 剪枝解析父项链接/标签，按实际文档序合并混合列表；导出 `resolveTocHrefs` 在已知 spine 上下文中将 fragment 绑定到基准文档；目录 UI 递归统计，使用唯一节点引用进行 fragment 精确/章首回退高亮，App 传递当前 path+anchor。
- 修改文件：`src/core/nav.ts`、`src/core/nav.test.ts`、`src/core/book.ts`、`src/test/book.test.ts`、`src/ui/TocPanel.tsx`、`src/ui/TocPanel.helpers.test.ts`、`src/App.tsx`、本任务及相关协作文档。
- 验证：旧实现新增父 `li` 回归为失败（误得“子节点”）；修复后 NAV 12/12（含 XML 直接嵌套 li）、book 14/14、Toc helper 3/3，`tsc --noEmit` 通过。目标书 1280×800 Chromium 复核确认 `.toc-count` 为 `334 项`、DOM `.toc-item` 为 334 个，缩进为 8/22/36px；存在正确的 `12.4.1 图片处理`，错误 NCX 标签 `14.1 图片处理` 为 0，证明 EPUB 3 NAV 优先。根“目录”无 disabled，点击后 iframe 含 `nav#toc`；点击 `12.4.1` 后唯一 active 正是该项，并进入 Chapter12-4 第 2/21 页，章节 h2 含 12.4.1～12.4.4。iframe `:target` 为 null 属于既有跨章 TOC jump 不写 `location.hash` 的范围外行为，不作为本项断言，也不扩修；临时脚本已删除。整组收尾 Vitest 34 文件、304 测试、`tsc --noEmit` 与 `pnpm build`（95 modules）均通过；无 Rust 改动，未运行 cargo。
- 剩余风险：同章 direct 导航不会为了高亮额外持久化当前 fragment，缺少运行时 anchor 时按章首或同路径第一项回退；不可读样式/分页不属于本项。
- 关联：C-36、B-026、`docs/BUGFIX_LOG.md`。

## B-044：UA 默认水平 margin 不应进入 C-04

- 状态：代码、自动化与 WSL Chromium 完成，待用户/Windows WebView2 审核。
- 现象：8.6.5「搬运注释」的两个顶层 `blockquote` 只在 inline 写 `font-size:.875em`，没有作者水平 margin；Chromium 的 UA stylesheet 仍计算出左右各 40px。C-04 把这两个 px 值解释成作者缩进，写成正文版心 base + 40px / 剩余值，整体向右偏移并越出设定范围。
- 根因：C-04 暂时解除 L3 `reader-top` auto margin 后，只依据非零 computed horizontal margin 决定补偿，无法区分作者/用户声明和 UA 默认值。
- 选择的修复：新增 `hasAuthoredHorizontalMargin(doc, el)`。它以 comment-aware inline 声明和当前生效 CSSOM 规则读取 `margin`、物理 `margin-left/right` 与 logical `margin-inline/start/end`；递归处理当前成立的 `@media/@supports`。未知条件、未知 grouping rule、匹配失败或不可读 sheet 返回 `undefined`，保持既有 C-04 保守行为。调用发生在 L3 auto 规则已移除之后，且只对确实拥有 nonzero/unknown computed horizontal margin、可能进入 C-04 的非百分比直接子扫描；百分比 margin 会由 C-16 先返回，不增加来源扫描。同一 reader overrides sheet 尾部的自定义 CSS 能保留为用户意图，而已移除的内建 auto margin 不会误命中，也不为零/auto 子元素额外遍历全部样式表。
- 接线：C-31 float 门控后、C-18/C-16/C-04 之前，只有 computed margin 有意义且来源明确为 false 的元素直接保留恢复后的 L3 自然版心；作者/用户 true 与 unknown 都继续原路径。百分比 margin 仍优先走 C-16 包含块路径，fit-content 无 margin 路径不变。
- 回归：旧实现新增 4 项 B-044 回归失败（helper/gate 不存在，原 paginator 48 项通过）；修复后 paginator 54/54、`tsc --noEmit` 通过。覆盖 inline font-size only、注释、shorthand/logical、匹配/不匹配 author rule、活动/非活动 media/supports、未知 grouping、不可读 sheet、reader sheet custom margin、`false/true/unknown` 门控、zero/auto 不探测边界与 C-16 百分比不探测边界。整组收尾为 Vitest 34 文件、304 测试、`tsc --noEmit` 与 `pnpm build`（95 modules）均通过；无 Rust 改动，未运行 cargo。
- Chromium 复核：目标书 8.6.5 的 1280×800 下两个 `blockquote` 均为 computed `width=640px`、`margin-left/right=312/312px`、inline 仍仅 `font-size:.875em` 且无 `data-reader-margin-fixed`；三段跨列 fragments 分别严格落在 `320..960`、`1608..2248`、`2896..3536` 的各列 40rem 版心。900×650 下二者均为 `width=640px`、`margin=122/122px`、无 fixed，fragments 为 `1038..1678`、`1946..2586`，后代视觉 rect 未越过块边界。相邻 B-023 赤月仍 1/1（70% margin `889/24px`、`fixed=1`）；B-024 玩具堂标题仍 `left=344px,width=640px,margin=339/291px,fixed=1`、首 toc `left=348px`；Sumeragi 1280 目录仍 1/1、行内盒右缘 960px。临时复核脚本已删除。
- 风险：CSSOM 无法读取或条件无法确定时会保留旧补偿，优先避免吞掉作者布局；尚未在 Windows WebView2 确认。此项不重置 `blockquote` 默认 margin、不按标签/书/章节特判，也不改变作者显式 margin、B-023 百分比、C-18 或 B-034。
- 关联：C-37、C-04、C-16、C-18、C-31、`docs/BUGFIX_LOG.md`。

## B-045：UA 对称 margin 被来源门控吞掉

- 状态：代码、自动化与 WSL Chromium 完成，待用户/Windows WebView2 审核
- 发现日期：2026-08-20
- 现象：B-044 之后，8.6.5 的两个 `blockquote` 不再错误右移，但恢复的 L3 `margin:auto` 又把它们放回完整 640px 正文版心，浏览器默认左右各 40px 的语义缩进消失，视觉上与普通正文一样宽。
- 根因：B-044 只证明该 margin 不是作者声明，随后直接跳过 C-04；这保留了居中，却没有保留 UA 对称 margin 表达的双侧内留白。不能把它重新交给 C-04，因为旧分支会将左侧 40px 当成单侧版心偏移。
- 约束：仅允许 `reader-top`、明确 `authoredHorizontalMargin === false`、非浮动/非全页、非百分比且左右 computed margin 有限、非零、对称的元素进入；不能出现负 `max-width` 或窄视口溢出；fit-content、C-31 float、作者/用户 margin 和未知来源保持原路径；写回必须随现有测量生命周期恢复。
- 选择的修复：新增 `getReaderTopUaSymmetricInsetMaxWidth()` 纯几何门控，在 C-31 后、C-04 前把当前 border-box 减去左右对称 UA inset，再按 `box-sizing` 换算为临时 `max-width`，保留恢复后的 L3 auto margin 居中。写回的 `max-width` 与 margin 一起进入 `marginFixes`，下一轮测量或 dispose 前恢复，重复重排不会累计缩窄。
- 为什么这样修：它保留了 B-044 的来源安全边界，又恢复了 blockquote 的语义双侧留白；`640px - 40px - 40px = 560px`，比恢复旧 C-04 的单侧偏移更符合布局含义，并且不依赖标签、书名或章节特判。
- 未采用方案：不撤销 B-044；不把所有对称 margin 交给 C-18；不全局重置 blockquote；不写固定 40px 规则；不在 float/fullpage/作者 margin 上复用该分支。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、本任务及相关协作文档。
- 验证：新增回归在旧实现下 1 项失败；修复后 paginator 55/55，全量 Vitest 34 文件、305/305，`tsc --noEmit` 与 `pnpm build`（95 modules）通过。目标 EPUB Chromium：1280×800 两个 blockquote 均 computed `width/max-width=560px`、`margin-left/right=352/352px`、`data-reader-margin-fixed=1`；每个 fragment 宽 560px 且逐列居中，后代无越界。900×650 两者均 `width=560px`、`margin=162/162px`、单列 fragment 无越界。B-023 赤月 900×650 仍 1/1；B-024 玩具堂 900×650 仍 `scrollWidth=clientWidth=890`、1/1；Sumeragi 900×650 仍 1/1。B-041 3.1 两个普通图文容器仍 block、图注在图下且无越界；B-042 五个 opacity float 仍同一行、无写回；B-043 12.4.1 仍进入第 2/21 页并显示对应章标题。临时脚本均在 `/tmp`，未写入仓库。
- 剩余风险：Windows WebView2 与发布包仍待用户人工确认；若旧引擎不能提供有限的 computed `width`/box-sizing，门控会保守跳过而不留下半修复状态。
- 关联：C-38、C-37、C-04、C-16、C-18、C-31、`docs/BUGFIX_LOG.md`。

## B-047：显式对称居中标题不应被 C-04 右移（C-40）

- 状态：代码、自动化与 WSL Chromium 完成，待用户/Windows WebView2 审核。
- 现象：みかみてれん目录的 `h3.ctt` 明确使用 `text-align:center` 与左右各 `0.75em` 的对称作者 margin；旧 C-04 优先使用左 margin，把标题盒整体右移 24px，标题中心与目录主体中心不一致。
- 根因：C-04 的 `ml>0` 分支无法区分“左对齐标题的真实左缩进”和“对称居中元素的作者 margin”，因此对后者重复叠加版心补偿。该问题不是 float 回归，也不按 `.ctt`、书名或章节特判。
- 选择的修复：新增通用 `shouldKeepCenteredAuthorMargins` 门控，并在 C-31/C-16/C-18/C-38 之后、C-04 之前接线。仅当元素是 viewer 直接 `reader-top`、`float:none`、`horizontal-tb`、非百分比/负/零/unknown margin、computed `text-align:center`、作者水平 margin 来源明确且左右有限正值对称（0.5px 容差）、没有作者固定/min/max sizing intent、非 fit/fullpage 时，保留 L3 自然 auto margin 并跳过 C-04。
- 来源安全：`hasAuthoredSizingIntent` 区分 inline/HTML width 属性和可读作者 CSSOM；阅读器内建 `max-width:40rem` 不算作者 sizing。固定/最小/最大宽度、不可读/unknown 来源、reader custom CSS、percentage/fit/fullpage 与非对称布局均保守走原路径；静态 CSS 选择器扫描跳过 keyframes（其不是静态 selector sizing source）。
- 兼容约束：B-024 的 `text-align:left; margin:1.3em 0.75em...` 必须继续保留左侧 24px 缩进；C-18 intrinsic/fit-content、B-023 百分比 margin、B-045 对称 UA blockquote、B-046/C-39 float 组均不改变。
- 修改文件：`src/render/paginator.ts`、`src/render/paginator.test.ts`、本任务及相关协作文档。
- 验证：paginator 定向 64/64；全量 Vitest 34 文件、314/314；`tsc --noEmit` 与 `pnpm build`（95 modules）通过。目标 EPUB Chromium 1280×800：标题与目录主体中心均 640px；900×650：均 450px；字号 16→20→16 无累计偏移，h3 无 C-04 marker。B-024 1280/900 仍为 `left=344/154px`、`text-align:left`、marker=1；B-045 blockquote 仍为 560px 对称盒；B-023、B-046 opacity float、金木犀 right float 回归通过。临时脚本仅在 `/tmp`，已清理。
- 剩余风险：Windows WebView2/发布包仍待用户实机确认；无法读取 CSSOM 或无法证明作者 sizing intent 时会保守保留旧行为，可能留下少量旧补偿但不会吞掉作者显式固定宽度语义。
- 关联：C-40、C-24、C-18、C-16、C-04、C-31、C-38、C-39、`docs/BUGFIX_LOG.md`。

## 交接说明

B-041～B-047 已完成代码审查、自动化与目标书/相邻书 Chromium 复核；等待用户审核、Windows WebView2/发布包实机验证与用户同步，避免违反单写入者原则。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
