# 阅读器样式分层规范（Rendering Layers）

> 目的：避免再出现“每本书一个特判、规则之间互相打架”的情况。
> 新增任何 CSS/样式逻辑前，先对照本文确定它属于哪一层、允许用多少优先级。

## 分层总览（从强制到可覆盖）

```
L1 安全/消毒层（绝对优先，书不可覆盖）
L2 用户设置层（用户主动选择 > 书）
L3 阅读器默认版心层（阅读器默认 > 书的通用规则）
L4 书内容布局层（书的具体规则 > 阅读器默认）
L5 引擎兼容补偿层（只在浏览器多栏 bug 时兜底，尽量少、尽量通用）
```

| 层 | 职责 | 典型规则 | 允许的 CSS 强度 |
|---|---|---|---|
| L1 安全/消毒 | CSP、删脚本、危险属性、脚注 aside 隐藏 | `#viewer aside[epub:type=footnote]{display:none}` | `!important` 可 |
| L2 用户设置 | 字号、主题前景/背景、行高、字重、字距、词距、rt 注音随主题换色 | `html{font-size:16px!important}`、`body{color:...}` | `!important` 可 |
| L3 阅读器默认版心 | 40rem 版心、页面级居中、图片防溢出、全页图整屏 | `:where(#viewer .reader-top){max-width:40rem}` | 默认值；`margin` 用 important 压书通用 reset |
| L4 书内容布局 | 书的 margin/width/max-width/float/font-family 等具体设计 | 不注入，尊重书 | 阅读器不得用高特异性覆盖 |
| L5 引擎兼容补偿 | CSS 多栏的 fit-content/float 收缩异常等 Chromium 行为补丁 | `#viewer .summary{max-width:40rem}` | 只打已知 bug；新补偿写清触发条件 |

## 每层规则说明

### L1 安全/消毒
- 脚本、CSP、危险标签/属性在 `sanitize.ts` DOM 阶段处理，**不参与级联谈判**；
- 脚注内容 aside 的隐藏属于安全/版式底线，允许 `!important`。

### L2 用户设置
- 主题、字号、行高、字重、间距是用户显式选择，书不能覆盖；
- 字体注意：阅读器 fallback 只放在 `html` 层；书在 `body` 上声明的内嵌字体优先（继承关系自然成立）。

### L3 阅读器默认版心
- 目的：普通书不写布局时，也有统一版心；
- 手段：
  - 直接子元素打 `reader-top` 标记；
  - `max-width` 用 `:where(#viewer .reader-top)`（零特异性），书类规则可覆盖；
  - `margin-left/right:auto` 需要压过书的通用 reset（`div{margin:0}`），所以带 `!important`。
- **不要**再回到“给所有嵌套元素加 max-width/margin”的写法。

### L4 书内容布局
- 书类规则（`.toc`、`.paper`、`.chat` 等）的布局声明必须生效；
- 阅读器注入规则不要用 id+class 组合去覆盖书类规则，除非它是 L2/L5 的明确例外；
- 出现“书规则没生效”先查是不是 L3/L5 误伤了它。

### L5 引擎兼容补偿
- 只解决浏览器 CSS 多栏的实际 bug：
  - `float` 元素 shrink-to-fit 塌成逐字宽度；
  - `max-width:fit-content` 异常；
  - 非 void 标签自闭合吞内容（DOM 预处理，不是 CSS）；
- 每条补偿必须注释：**触发条件 + 影响哪些书 + 何时可以移除**；
- 优先通用（如 cssRewrite 跳过纯标签/组合器/float 的 width% 换算），特判类（`.summary`）只是兜底。

## 新增规则的检查清单
1. 它解决的是书 bug 还是阅读器 bug？
2. 属于 L1–L5 哪一层？
3. 需要 `!important` 吗？为什么？
4. 选择器特异性是多少？会压过哪些书规则？
5. 对已经回归的书（铁人目录/诡屋信件/星空信息页/榛名 CONTENTS/三上目录）有没有影响？
6. 是否只影响当前这本书？能否抽象成通用规则？

## 规则冲突台账（已发现，持续维护）

> 状态：✅ 已修 / 🔶 部分修 / ❌ 未修 / ↩ 已撤销。
> 每一条新增规则必须在这里登记，禁止无台账的散装特判。

| 编号 | 层 | 冲突属性 | 问题 | 处理 | 状态 |
|---|---|---|---|---|---|
| C-01 | L2 | `background` | 主题用 `background` 简写，重置了书的 body 背景图 | 主题只写 `background-color` | ✅ |
| C-02 | L3 | `max-width` | 阅读器 `40em !important` 压掉书 `.paper{max-width:30em}` | 改为 `:where()` 零特异性 + `rem`；书类优先 | ✅ |
| C-03 | L3 | `margin-left/right` | `reader-top{margin auto !important}` 压掉目录条目交错 margin | 嵌套元素不强制；直接子走两阶段判断 | ✅ |
| C-04 | L3 | `margin-left/right` | 同一规则压掉 `.namebox{margin-left:2em}` 等直接子具体布局 | 两阶段：默认居中渲染后，屏蔽阅读器规则读取纯书 margin，非零且非“auto 居中形态”则按“margin-box 居中 + 书不对称偏移”写回 inline !important | ✅ |
| C-05 | L3 | `padding` | `html,body{padding:0!important}` 压掉 LK 书 `body{padding:0 5px}` | 移除 padding 清零；UA 默认已是 0，书声明自然生效 | ✅ |
| C-06 | L4 | `font-family` | body 覆盖书的内嵌字体 | fallback 移到 html，body 不写 | ✅ |
| C-07 | L4 | `width:%` | 文本层把 `width:X%` 直接改成固定 em，误伤“% 相对窄包含块”的规则（note/.ctt/.authorbox table，以及命定之人目录 `.toc-link{width:100%}` 相对 53px td） | 改写为 `min(X%, X/100×40rem)`：页面级取版心比例，窄容器由浏览器取书自己的 %；仅 0<X≤100 改写，>100 出血保留；纯标签、组合器、float、img/fullpage 跳过清单继续保留 | ✅ |
| C-08 | L5 | `float` 收缩 | CSS 多栏里 float shrink-to-fit 塌成逐字宽 | 分页器 Canvas 测 max-content 后按可用宽收缩写回 px；只处理宽度 ≤48px 的塌缩浮动元素；`<br>` 按最长行计；媒体专用小 float 由 C-23 排除；WSL 用 `scripts/setup-pw-fonts.mjs` + XDG_DATA_HOME 解决字体 | ✅ |
| C-09 | L5 | `fit-content` | CSS 多栏里 fit-content 异常 | 分页器运行时统一把 fit-content 元素 max-width 设为版心 40rem（已移除 .summary 特判） | ✅ |
| C-10 | L4 | `text-align/float` | 曾全局强制 `.ctt` 居中，覆盖书设计 | 已撤销，尊重书 | ↩ |
| C-11 | L2 | `color` | `rt` 注音在深色主题不变色 | `#viewer rt` 随主题前景色 | ✅ |
| C-12 | L1/L3 | 图片尺寸 | 普通图片规则用 `!important` 可能覆盖书设定 | 普通图片规则改为 `:where(#viewer)` 零特异性默认值；全页图块保持 important | ✅ |
| C-13 | L4/序列化 | CSS `>` 文本 | XMLSerializer 在 `<style>` raw-text 中输出 `&gt;`，HTML 不解码导致子组合器失效 | 仅在序列化后的 `<style>` 内容恢复 `&gt;`；保持 `<` 与其他文档区域转义 | ✅ |
| C-14 | L3/结构语义 | 祖先元素类型 | 注入 `<div id="epub-viewer">` 使 body 顶层 p 成为 `div p` 后代，误命中书规则 | 改用 `<epub-viewer id="epub-viewer">`，显式 `display:block`；分页器仍只依赖 ID | ✅ |
| C-15 | L3 | 顶层链接版心 | viewer 直接子 `<a><p>…</p></a>` 中，inline 的 a 不接受版心 max-width/auto margin，内容贴窗口左缘 | 仅给 `a.reader-top` 提供零特异性 `display:block` 默认值；书籍具体 display 可覆盖 | ✅ |
| C-16 | L3/L4 | `% margin`、auto margin | 二阶段补偿把页面相对 35% margin 再叠加版心 base；fit-content 用 content width 判断含 padding/border 的 auto 居中，均导致整体右移 | 百分比水平 margin 走包含块原位写回并按需解除默认 max-width；auto-like 统一用 border-box；所有临时值/优先级随 reflow 恢复 | ✅ |
| C-17 | L3/L4 | inline SVG 图片尺寸 | 多看纯图片页用 `div > svg > image`，未命中只统计 HTML `img` 的全页检测；40rem 顶层版心使 SVG 按 viewBox 比例产生超页高度后被裁切 | 仅把“无文字、单个带 viewBox 的 SVG、且直接包含单个 image”纳入 fullpage；HTML 祖先传递页面高度，SVG 视口 100% contain，内部 image 与 preserveAspectRatio 保持书设计 | ✅ |
| C-18 | L3/L4/L5 | fit-content 与对称 margin | margin 定位先于 fit-content 宽度补偿，导致不同内容盒按异常旧宽度散开；`margin:1em` 又被当成单向缩进 | 先稳定 fit-content 最终宽度再计算 margin；保留原始收缩意图；正对称正值 margin 保持 reader auto 居中，真正不对称与负 margin 继续走书布局 | ✅ |
| C-19 | L5/渲染时序 | 首次绘制与二阶段布局 | blob iframe 在字体等待、fit-content/margin/float 补偿和分页自愈前已经可见；同尺寸 ResizeObserver 空转又会在 ready 后暂时撤销补偿，形成盒子横向闪动 | `VisibilityGate` 用 load 代次把 iframe 保持为可布局但不可见，等待统一准备流程及最终入口定位后揭示；20 秒/错误/dispose 恢复；完整测量尺寸未变时跳过 ResizeObserver 空转 | ✅ |
| C-20 | L5/交互时序 | hidden iframe、滚轮目标锁定与持续 wheel | `visibility:hidden` 不参与鼠标命中；浏览器又可能把同一连续滚轮锁定在外层目标，若外层只在 loading 接收，则揭示后固定停在第 2/倒数第 2 页 | `ReaderView` 始终接收外层 wheel：loading 时 `TurnIntentBuffer` 只留最后方向，display-ready 消费一次；ready 后同一锁定流由 `WheelTurnAccumulator` 按 80px 阈值持续翻页；错误/销毁清空 | ✅ |
| C-21 | L1/L3 | 根高度、盒模型与 overflow | `html/body{height:100%}` 仍是 content-box 时，书的上下 padding 会叠加到视口高度，短目录也产生根滚动条 | 根页面统一 `box-sizing:border-box`，保留书 padding 并让 viewer 使用 body 内容区；`overflow:hidden!important` 固化“只由 viewer 分页”的底线 | ✅ |
| C-22 | L3/L4 | 块内容链接的多栏 fragmentation | 默认 inline 的 a 包住 `div + p` 时，Chromium 可在两块之间断列，使装饰线孤立在前页、文字落到后页 | 零特异性匹配直接包含常见块元素的 a，默认 `display:block;break-inside:avoid`；普通行内链接不命中，书籍具体规则可覆盖 | ✅ |
| C-23 | L5 | 小型媒体 float 宽度 | C-08 用“宽度 ≤48px”识别文字塌缩时，把正常的 24px 头像 float 也当成异常；Canvas 又把源码缩进空白计入宽度，产生 82.2px inline width | C-08 测量前排除有效内容只有直接 `img/svg` 的 float；空白与注释不算内容，任何可见文字或其他元素仍进入原判断 | ✅ |

## 新增规则登记模板
```md
| C-xx | Lx | 属性 | 触发场景 | 处理策略 | 状态 |
```
规则落地到代码时，CSS 注释必须带编号，例如 `/* [L5-C09] .summary fit-content 补偿 */`。

## 维护原则（防止“一个 bug 一条特判”）
1. 先归层，再决定强度：L1/L2 允许 `!important`；L3 用零特异性默认值；L4 不注入；L5 必须登记且写明移除条件。
2. 同一冲突不允许第二次用新特判；优先升级为通用规则（如 cssRewrite 的跳过规则）。
3. 每次新增规则，同时更新本台账 + 跑既有回归书清单。
4. L5 兼容规则集中管理，目标是数量只减不增。

## 未知冲突处理流程（新 bug 出现时）
新 bug 一定会有，处理顺序固定如下，避免拍脑袋：

1. **定位现象**：文字/盒子/背景/字体/对齐/溢出/换行；
2. **定位属性**：最终是哪个 CSS 属性被谁覆盖（诊断面板 `fitContentEls/wideEls`，或临时打印 computed style）；
3. **判定来源**：
   - 书 CSS 本身如此 → 尊重书，通常不改；
   - 阅读器注入覆盖 → 查本台账是否有同类；
   - 浏览器多栏/引擎 bug → 归 L5；
4. **归层**：按 L1–L5 选择策略；
5. **选择修复强度**：通用规则 > 层内默认值 > 登记过的特判；
6. **先写回归**：为该书/该属性补一个最小回归用例（单测或渲染矩阵），再改代码；
7. **更新台账**：状态、编号、移除条件。

## 自动化防线（防止回归）
- 单测：CSS 文本改写、消毒输出、脚注识别、分页交互等逻辑层（现有 158 项）；
- 渲染矩阵（建议固化）：对固定样本书 + 关键页断言 computed style，至少覆盖：
  - 铁人目录条目 margin 交错；
  - 诡屋 `.paper` 480px；
  - 星空 `.mesbox` 居中；
  - 鹤城 `.summary` 640px；
  - 三上 `.ctt` 保持书设计；
  - 深色主题 `rt` 换色。
- 新 bug 修复必须进上述两类回归之一，禁止只靠手工验证一次。

## 已知未来收敛方向
- `width:%` 已改为 `min(书百分比, 版心比例)`（C-07），窄容器由 CSS 引擎按真实包含块取值，不再依赖选择器启发式猜测；`>100%` 的出血意图保持原样。若将来出现“父容器故意宽于 40rem 且内部 `width:100%` 需要取大”的样本，再评估运行时版心判断。
- L5 的 float/fit-content 补偿目前散在 sanitize/cssRewrite；后续统一收口到分页器测量阶段。
