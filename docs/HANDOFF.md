# 交接文档（供新对话接手）

> 最后更新：条目 31（width:%→min 重写，命定之人目录修复）之后。项目：`/home/herenfor/test/epub-reader`
> 这份文档自包含；新对话请先通读，再继续处理用户报告的问题。

---

## 1. 项目是什么

Windows 桌面 EPUB 阅读器（EPUB 2/3），技术栈：

- **外壳**：Tauri 2（Rust）+ WebView2，`src-tauri/`
- **前端**：React 18 + TypeScript 5 + Vite 6，`src/`
- **解包**：fflate（ZIP）在前端完成，**不依赖任何后端命令解析 EPUB**
- **分页**：自研 CSS multi-column 分页（`#epub-viewer` 全宽，`column-width`=页宽，`column-fill:auto`，翻页=滚动 scrollLeft）
- **架构要点**：
  - `src/core/`：book.ts（加载编排）、zip/opf/ncx/nav（目录双模式）、fonts.ts（IDPF 字体混淆 SHA-1 XOR）、paths/xml/parseXml（浏览器 DOMParser / node xmldom 双实现）、types.ts
  - `src/render/`：sanitize.ts（章节消毒+CSS 注入，**改动最频繁**）、cssRewrite.ts、paginator.ts（分页/翻页/锚点/脚注）、resources.ts（ResourceServer→blob URL）、settings.ts（ReaderSettings + TEXT_MEASURE）
  - `src/ui/`：App.tsx（状态机）、ReaderView.tsx（paginator 生命周期）、Toolbar/MenuPanel/TocPanel/LogPanel/FootnotePop、storage.ts（进度/设置持久化）
- **测试书**（在 `/home/herenfor/test/`）：
  - `[简][七菜なな].能够率直说出喜欢的女生无双.04.epub`（LK 风格，插图/分隔图/目录样式齐全，图片问题主要用它复现）
  - `[简][鐵人じゅす]…01.epub`（多章节、自闭合 script、脚注）
  - `【测试专用】记忆的琴键.epub`（壳书）
  - `script.js`：LK 阅读器的参考脚本（脚注弹层、bgcolor 优化、单图自适应），仅作**参考**，勿直接引入

---

## 2. WSL 内的开发/测试命令

工作目录：`/home/herenfor/test/epub-reader`

```bash
pnpm test      # vitest 单测，当前 118 项全绿（src/**/*.test.ts）
pnpm build     # tsc 类型检查 + vite 生产构建（交给用户前必跑）
pnpm dev       # 浏览器开发模式，端口 5173
```

**无头浏览器实测**（环境无系统字体/浏览器，用项目内便携 Chromium）：

```bash
pnpm pw-fonts   # 从测试书提取内嵌字体到 /home/herenfor/test/.pw-xdg/fonts
export LD_LIBRARY_PATH=/home/herenfor/test/epub-reader/.pw-libs/root/usr/lib/x86_64-linux-gnu
export PLAYWRIGHT_BROWSERS_PATH=/home/herenfor/test/epub-reader/.pw-browsers
export XDG_DATA_HOME=/home/herenfor/test/.pw-xdg
export XDG_CACHE_HOME=/home/herenfor/test/.pw-xdg-cache
npx tsx scripts/img-repro.ts    # 七菜04 Section03：全屏图 p034 + 分隔图 kugiri 渲染盒实测
npx tsx scripts/w90-repro.ts    # width:% 盒子在 1100/800/650 三窗口的宽度实测
```

> 中文路径下的书需要用 `readFileSync` 读取；脚本里已有范例。

### 环境坑（新对话务必知道）

1. **沙箱**：只能写 `/home/herenfor/test/` 工作区；无 sudo/root；`~/.cache`、`~/.cargo` 等家目录不可写（装工具必须装进项目内，如曾经的 `.toolchain/`，已删除）。
2. **网络**：间歇性断连（TLS reset/eof），下载务必带重试+断点续传（`curl -C - --retry`）。
3. **端口**：当前 dev 端口 5173。Windows 保留段随重启会变：1420、5517（5470-5569 段）都曾先后落入 Hyper-V 保留区间导致 EADDRINUSE；换端口前先 `netsh interface ipv4 show excludedportrange protocol=tcp` 查保留段。
4. **rustup 在此环境不可用**（rename 报 EXDEV，沙箱兼容问题）；若将来又要 Rust，直接下官方 tarball 手工解包（历史方案见会话记录，`.toolchain/` 已清理）。
5. **代码级坑位目录**（前人踩过，改代码时注意）：
   - 自闭合 `<script .../>` 会被 HTML5 解析器吞章节 → sanitize 里已预处理成 `</script>`
   - `<style>` 注入的 CSS 里不能用 `>` 子选择器（序列化变 `&gt;`，RAWTEXT 不解码）→ 一律用后代选择器
   - xmldom 不反射 `el.id=`，必须 `setAttribute`
   - `findElements(root, "*")` 永远返回空（按 localName 精确匹配），要遍历全部元素需手动递归
   - 页内 `<style>` 块、`<link>` 样式表、内联 style 三处都要过 rewriteCssUrls，别漏

---

## 3. scripts/ 工具清单（已整理）

**顶层（正式工具）**：

| 文件 | 用途 |
|---|---|
| `build-windows.ps1` | Windows 一键打包（**纯英文 ASCII + CRLF**，PowerShell 5.1 兼容；中文会因 GBK 误读报语法错误） |
| `check-book.ts` | 校验/解包 epub 的命令行工具（`pnpm check <book>`） |
| `gen-icons.mjs` | 生成 Tauri 图标（`pnpm icons`） |
| `pack-epub.mjs` | 把解包的源码树打包回合法 epub（`pnpm pack`） |
| `img-repro.ts` | 图片渲染实测（本轮新增，见 §2） |
| `w90-repro.ts` | 宽度百分比实测（本轮新增，见 §2） |

**`scripts/archive/`（历史调试脚本，全部可跑但属一次性）**：`headless-*.ts`（26 个特性回归：sticky 锚点/脚注/菜单/主题/滚轮/按键…）、`run-headless-*.ts`（对应 runner，依赖 `/home/herenfor/test/hltest/` 里的 `book.b64` 等产物）、`bg-repro.ts`、`ui-*-test.ts` 等。新功能回归可参考其写法，但当前以 `scripts/img-repro.ts` / `w90-repro.ts` 为最新范式（直接用 tsx + 项目内 Playwright，不需要 hltest 产物）。

**项目外辅助**（`/home/herenfor/test/` 下）：`hltest/`（旧 harness 的 book.b64、dejavu.ttf 字体注入源，归档脚本仍引用）、`.pnpm-store/`（pnpm 全局缓存）。

---

## 4. 本会话最近完成的工作（新对话的起点）

用户主线：在 WSL 修问题 → 在 Windows 打包自测。**当前所有修复都在 WSL 源码里，尚未重新打包**（用户明确说"先不走打包"）。

1. **打包版无法拖拽导入** → 已修：Tauri 打包版 WebView2 拦截 HTML5 drop，改为 `getCurrentWebview().onDragDropEvent` + 新增 Rust 命令 `read_epub_file`（`tauri::ipc::Response` 直返 ArrayBuffer）。涉及 `src/App.tsx`、`src-tauri/src/lib.rs`、`src/styles.css`（拖拽遮罩）、`package.json`（+`@tauri-apps/api`）。
2. **正文普通图高度问题**（`.cut img{height:2em}` 被覆盖 CSS 的 `height:auto!important` 压掉）→ 已修：通用 img 规则改为 `max-width:100% + object-fit:contain`，不再强制 height:auto；全屏图块规则不变。顺手加 **bgcolor 优化**（书声明 body bgcolor 时浅色主题跟随，白名单校验防注入）。涉及 `src/render/sanitize.ts`。
3. **width:90% 盒子几乎占满整页** → 已修：`width:X%` 统一换算为 `X/100×40em`（版心），覆盖内联 style / width 属性 / 页内 `<style>` 块 / `<link>` 样式表四处；全页图块、img/svg、已定宽祖先内部、html/body 选择器跳过；删掉 `#epub-viewer table{max-width:100%}` 特例（它压过版心限宽）。涉及 `src/render/sanitize.ts`、`src/render/cssRewrite.ts`。
4. 测试从 75 → **84 项**（sanitize.test.ts +5、cssRewrite.test.ts +2 等），全部通过；`pnpm build` 通过。
5. **目录页背景图不显示**（鐵人01：`body{background-image:url(...)}` 被主题覆盖样式的 `background:` 简写重置为 none）→ 已修：主题与 bgcolor 注入都改为只用 `background-color`，不再重置/遮挡书声明的 body 背景图。sanitize.test.ts 新增 2 个回归用例，测试 **84 → 86 项**；已用项目内 Playwright 打开真实书端到端验证（iframe 内 computed `background-image` 为 blob URL、viewer 背景透明）。
6. **script.js（LK 参考脚本）弹注适配** → 已实现原生支持：新增 `src/render/footnotes.ts`（识别多看/掌阅类 + script.js 的 `<note><sup><a href="#asideId">` 通用模式、提取 aside 文本、zy-footnote 属性兜底）；sanitize 注入 CSS 隐藏 `#epub-viewer note aside`（脚本被禁时正文不再漏出注释块）；ChapterPaginator 新增 hover 弹注/移出关闭（桌面）+ 点击弹注（移动端友好），App/ReaderView 接线 `onFootnoteClose`。footnotes.test.ts 8 用例 + sanitize.test.ts 1 用例，测试 **86 → 95 项**；已用铁人01 第二章真实书验证：hover 出现弹层“注：SECOM…”、移出关闭、点击弹层、aside computed display:none。
   - 注意：script.js 的“单图自适应（kuchie change 类）”部分**未适配**，将来有图片 bug 时再评估。
7. **排版滑块拖动实时重排** → 已优化：`MenuPanel` 的 `SliderRow` 改为“拖动只更新本地预览值，原生 `change`（松开鼠标/键盘确认/失焦）才提交”。React `onChange` 绑定的是原生 `input`，以前每一步都触发整章重载。字号/行高/字重/字间距/字符间距五个滑块统一生效；± 按钮仍立即生效。已用 Playwright 验证：连续 input 事件期间 iframe src 与字号不变，change 后只重排一次。无新增单测（纯 UI 交互，无 React 测试设施）。
8. **左右拉伸窗口实时重排** → 已修（用户确认该优化指的是窗口拉伸而非滑块）：`ReaderView` 的 `ResizeObserver` 从 rAF 每帧 `reflow()` 改为 **250ms debounce**——拉伸过程中只重置定时器不重排，停止拉伸 250ms 后重排一次（窗口边框拖动拿不到 mouseup，静默期即“拉伸结束”信号）。Playwright 验证：连续 5 次改 iframe 宽度（间隔 100ms）期间 viewer 布局保持旧值，停止后一次性变为最终宽度。
9. **《诡屋.01》第二章信件盒（.paper width:90%）过宽** → 已修，根因两层：① 章节样式表用 `@import "default.css"` 引入 `.paper{width:90%}`，原 `rewriteCssUrls` 只改写顶层样式表、被 import 的 CSS 内容不参与 width:%→em 换算；② 注入的 `#viewer :not(img){max-width:40em !important}` 覆盖了书自己的 `.paper{max-width:30em}`。修复：`rewriteCssUrls` 支持 `getText` 选项，`@import` 本地样式表**递归内联并按其自身路径改写**（url() 与 width:% 一起修正，含媒体条件包裹、循环 import 保护）；sanitize 的版心上限改为 `:where(#viewer :not(img)){max-width:40em}`（零特异性，尊重书显式声明的更窄 max-width）。真实书验证：信件盒由 640px 回到书设计 480px(30em) 居中；w90-repro/img-repro 回归正常。测试 **95 → 100 项**（cssRewrite +3、sanitize +2）。
10. **鐵人01 目录页条目左右 margin 不生效** → 已修：注入规则的 `margin-left/right: auto !important` 压掉了 `.toc/.bg1box/.bg2box` 的交错边距。改为 `:where(#viewer :not(img)){margin-left:auto;margin-right:auto}`（无 important）——书显式声明的 margin 优先，未声明的普通段落仍自动居中。真实书验证：bg1box 右 32px / bg2box 左 32px、x 坐标交错；普通正文 p 仍 640px 居中。sanitize.test.ts +1，测试 **100 → 101 项**。
11. **星空书制作信息页靠左（条目 10 的回归）** → 已修并定型为最终层级：阅读器版心规则选择器改为 `:where(#viewer) :not(img)`，特异性 (0,0,1)——比书的通用元素规则（`div{margin:0}` 同为 0,0,1，注入在后所以胜出）高，比书的类规则（`.toc`、`.paper` 为 0,1,0）低。效果：默认居中/40em 上限生效，书用类声明的布局全部尊重。三书实测：星空 `.mesbox` margin 400px 居中；铁人目录条目 ml/mr 交错保留；诡屋 `.paper` 480px 保留。测试数不变（101）。
12. **艾琳画集纯图片 title 页被拆成两页** → 已修：sanitize 的“无文字+有图 → fullpage-image”判定过宽，title 页有两张上下排列的图（t1 21em + t2 7em），每张都被强制 100%×100% 整页。改为**仅单图页面**注入 fullpage-image；多图页保留书自身排版。实测：title 页 1 页，两图上下排列，body 背景色 `#b5d0e5` 正常；单图插图页仍 fullpage-image 全屏。sanitize.test.ts +1，测试 **101 → 102 项**。
13. **鐵人01 标题页作者/插画行不居中** → 已修：阅读器版心 `max-width:40em` 的 em 相对元素自身 font-size，`.c1`(0.75em) 得 480px、`.c2`(1.05em) 得 672px，再被书 `.titlebox p{margin:0}` 定死在左边。改为 `max-width:40rem`（相对根字号，所有元素一致且随用户字号设置缩放）。实测标题页所有行宽 640px、文字中心对齐页面中心；星空/铁人目录/诡屋三处旧修复全部回归正常。sanitize.test.ts 断言同步，测试数不变（102）。
14. **鐵人01 正文 ◇◇◇ 分隔符靠左** → 已修：`.cut{margin:…}` 类规则覆盖了阅读器默认 auto，而阅读器给它 40rem 宽盒子，盒子贴左导致 text-align:center 只在盒内居中。修复：sanitize 阶段给 `#viewer` 的**直接子元素**打 `reader-top` 标记，注入规则 `:where(#viewer) .reader-top { margin-left/right: auto !important }`——页面级内容（标题/正文段/分隔符）强制版心居中，嵌套元素（目录条目等）不受影响、书布局生效。注意不能写 `>` 子选择器（序列化转义坑），因此用 class 标记；xmldom 无 `element.children`，用 childNodes 遍历。实测第一章三处分隔符都在所在列居中；标题页/目录/星空/诡屋旧修复全部回归。sanitize.test.ts +1，测试 **102 → 103 项**。
15. **長山書标题页限宽图被全屏** → 已修：fullpage-image 判定再加一条——单图页面且图片自带尺寸约束（inline style 的 width/height/max-/min-，或 width/height 属性）时不注入整屏填充，按书排版显示。xmldom 的 getAttribute 对缺失属性返回 "" 而非 null，判空要用 Boolean()。实测：長山标题图 13em=208px 居中、1/1 页、背景图正常；艾琳单图插图页仍 fullpage-image 全屏。sanitize.test.ts +1，测试 **103 → 104 项**。
16. **脚注“注”图标太高挡上一行** → 已修：注入规则里脚注图标 `vertical-align: top` 改为 `middle`，图标整体下移约 7px（实测 top 291→298），不再侵入上一行文字。sanitize.test.ts +1，测试 **104 → 105 项**。
17. **初鹿野書作者页罗马音飞到页面最右** → 已修：`.authorbox table{width:100%}` 的 % 本应相对 224px 的 authorbox，但 cssRewrite 把嵌套选择器的 `width:100%` 换算成固定 40em，表格溢出父容器，右对齐罗马音被甩到页面右侧。修复：width:%→em 换算**跳过带组合器（后代/子代/+/~）的选择器**（其 % 通常相对限宽父容器）；判断前先剥离 CSS 注释。实测：authorbox 224px 居中、表格 224px、罗马音右端对齐 authorbox 右端。cssRewrite.test.ts +1，测试 **105 → 106 项**。
18. **榛名书目录页 CONTENTS 几个字母变小** → 已修：XHTML 空元素 `<span class="em05"/>` 在 HTML 解析器里不是自闭合，会吞掉后续字母并把它们套进 0.5em 字号。修复：sanitize 预处理统一把**非 void 标签**的自闭合写法补成显式开闭标签（`<span/>`→`<span></span>`；br/img 等 void 保持）。实测 CONTENTS 八个字母全部正常字号、span 全空。sanitize.test.ts +2，测试 **106 → 108 项**。
19. **外部链接功能** → 已实现：新增 `@tauri-apps/plugin-opener@2.5.4` + Rust `tauri-plugin-opener = "2"`，capabilities 加 `opener:default`。链路：ChapterPaginator 新增 `onExternalLink`（http/https/mailto/tel 白名单，data/blob/file 忽略）→ ReaderView → App：Tauri 环境 `openUrl()` 调系统默认浏览器，浏览器 dev 用 `window.open`；失败写入问题日志。浏览器端已验证 popup 打开 lightnovel.fun；**Tauri 桌面端需 Windows 重新 pnpm install + cargo 构建验证**。版本已升至 0.1.2。
20. **书 body 声明的内嵌字体被阅读器覆盖** → 已修：注入的 body 规则去掉 `font-family`（只保留主题 color/background-color），阅读器系统字体 fallback 移到 `html` 层——书的 `body{font-family:main,emoji,sym}` 自身声明优先，继承 fallback 只在书没声明时兜底。实测铁人书：body/p 计算字体均为 `main, emoji, sym`，html 为系统 fallback。sanitize.test.ts +1，测试 **108 → 109 项**。
21. **あさの书第1话带注释行逐字换行** → 已修：① cssRewrite 纯标签/float 的 width% 不再换算；② C-08 浮动元素 shrink-to-fit 补偿已落地（Canvas 逐文本节点测 max-content + 父容器可用宽收缩写回 px，只处理塌缩宽度 ≤48px 的 float，`<br>` 按最长行）。WSL 无系统字体已解决：`pnpm pw-fonts` 提取测试书字体到 `.pw-xdg/fonts`，Playwright 运行时设 `XDG_DATA_HOME=/home/herenfor/test/.pw-xdg`。实测短气泡收缩（清单？76px）、长气泡到边换行（注释行 378×44）。
22. **三上书目录页 CONTENTS 不居中** → 已修宽度换算部分：cssRewrite 的 width:%→em 换算把 `.ctt{width:100%;float:left}` 的 100% 换成 40em，再按 .ctt 自身 1.2em 字号变成 768px，盒子甩出 336px 的 tocbox——现在**声明了 float 的规则不换算**。**第二条修复（注入 `#viewer .ctt{float:none;text-align:center!important}`）已按用户要求撤销**：书本身写的是 left/float:left，应尊重书。实测撤销后三上书 `.ctt` 恢复 `text-align:left;float:left`；铁人书书自带 center 不受影响。
    **通用教训**：CSS 文本层的 width%→em 换算缺少 DOM 上下文，无法判断 % 是相对页面版心还是相对限宽父容器，已两次踩坑（note 的纯标签 100%、.ctt 的 float 100%）。更稳的方向是逐步把宽度换算移到 DOM/布局层，而不是继续在 CSS 文本里加特判。
23. **深色模式下 ruby 注音 rt 不换色** → 已修：书 CSS 常写 `ruby>rt{color:#333}`，深色主题仍保持深色看不清。注入 `#viewer rt { color:<主题前景色> }`（id 特异性高于书规则）。实测三上书 rt：浅色 rgb(26,26,26)，深色 rgb(212,212,212)。sanitize.test.ts +1，测试 **112 → 113 项**。
24. **鹤城书简介宽度异常（实际 fit-content 塌成 34px 窄条）** → 已修并升级为通用运行时补偿：sanitize 不再写 `.summary` 特判，分页器 `applyFitContentFix` 对 computed max-width 含 fit-content 的元素统一设 `max-width:40rem`（后续已调通）。诊断面板新增 `fitContentEls=`、`wideEls=` 两行。
25. **按分层台账批量修复（C-04/C-05/C-08/C-09/C-12）**：
    - C-04 直接子 margin 两阶段：默认居中渲染后屏蔽阅读器表，读纯书 margin；非零且非“auto 居中形态”则按 **居中版心列左缘 + 书 margin 缩进** 写回（鹤城 `.namebox` 最终 `382px/318px`，图片左缘与正文首行缩进完全对齐 x=387）。
    - C-05 移除 `html,body{padding:0!important}`，LK 书 `body{padding:0 5px}` 恢复；同时分页宽度改为 body **内容区宽度**（clientWidth - padding），消除 5px 横向溢出滚动条。
    - C-08 见条目 21，Canvas 测量补偿已启用并验证。
    - C-09 fit-content 改为运行时通用补偿（移除 .summary 特判）。
    - C-12 普通图片规则改为 `:where(#viewer) img` 零特异性默认值（书规则可覆盖）；全页图块仍 important。
    - WSL 字体：`pnpm pw-fonts` + `XDG_DATA_HOME=/home/herenfor/test/.pw-xdg`（Playwright 测试命令见 §2）。
    - 回归矩阵全绿：namebox 对齐、summary 640、body padding 0 5px、目录交错、cut 居中、mesbox 居中、paper480、ctt 书设计、聊天泡收缩/换行。测试 113 项、build 通过。
26. **margin 两阶段的两个边界修复**：
    - auto 居中判断从字符串相等改为数值容差（computed auto 左右可能有 516.594/516.609 的浮点差），修复逢緣书目录 tocbox 被推到最右（现恢复 516.6/516.6 居中）；
    - 增加 `data-reader-margin-fixed` 标记防止重复测量时把上次写回值当书 margin 叠加，修复鹤城 namebox 第二次测量后变成 732/-32 的问题。两书复测正常，全量回归通过。
27. **初鹿野简介页 margin 偏左** → 根因：margin 第二遍记录元素宽度时用了 `getBoundingClientRect().width`，而简介块跨两列碎片时该值会并成 1844px，auto 居中判定和 margin 换算全部错误（得到 178/-682）。改为用 **computed width**（480px）作为版心宽度。**通用原则：多栏布局里任何布局计算都不要用 getBoundingClientRect().width，碎片矩形不可靠；用 computed width 或 offsetWidth**。修复后初鹿野 summary margin 430/430 居中；鹤城/逢緣/全量回归通过。
28. **深色模式下着重号不换色** → 已修：书 `.dot{text-emphasis:circle #000}` 在深色主题下仍黑色。深色主题注入 `#viewer * { -webkit-text-emphasis-color:<fg>; text-emphasis-color:<fg>; }`；浅色不注入（尊重书）。实测初鹿野 `.dot`：浅色 rgb(0,0,0)，深色 rgb(212,212,212)。sanitize.test.ts +1，测试 **113 → 114 项**。
29. **伊尾微书深色模式目录链接不换色** → 已修：书显式 `.toc a{color:#000}`，深色下不可读。与用户确认采用 Sigil 深色预览风格浅蓝 `#6cb2ff`，深色主题注入 `#viewer .toc a { color:#6cb2ff }`；浅色不注入。实测 light rgb(0,0,0) / dark rgb(108,178,255)。sanitize.test.ts +1，测试 **114 → 115 项**。
30. **駄犬书目录页左对齐容器被强制居中** → 已修并升级为通用规则：书里 `div{max-width:max-content}`（无 auto margin）表示“内容收缩 + 左对齐”，阅读器不再按 L3 强制居中，而是放到**版心列左缘**。margin 第二遍新增分支：原始 max-width 含 fit-content/max-content 且纯书左右 margin 为 0 → `margin-left = (parentW - 40rem)/2`。实测目录容器/条目在每页都从版心列左缘（窗口 x≈371）开始；鹤城 namebox、初鹿野 summary、逢緣 tocbox、あさの气泡回归正常。
31. **命定之人是妻子的妹妹 1 目录页乱页（width%→em 第五个误伤）** → 已修并升级 C-07：旧公式把 `.toc-link{width:100%}`（相对 53px 的 td）写成固定 40em，目录图 230px 宽在 53px 列里重叠溢出、竖切 9 页。改为 `width:X% → min(X%, X/100×40rem)`：页面级仍取版心比例（90%→576px、100%→640px），窄容器由 CSS 引擎按真实包含块取书自己的 %（td 内 100%→53px）；仅 `0<X≤100` 改写，`>100` 出血保留；顺手修掉旧正则误匹配 `max-width/min-width` 里 “width:” 子串的问题；纯标签/组合器/float/img/fullpage 跳过清单不动。实测命定目录恢复单页、12 列 52px 无重叠；诡屋 paper 480px、逢緣 facebook 480px、三上 ctt 336px、初鹿野 authorbox table 224px 全部回归不变。测试 **115 → 118 项**；`pnpm test`/`pnpm build` 全绿。备份已覆盖更新至 `/home/herenfor/epub-reader-backup-before-css-fixes`。

**命定之人目录问题已按条目 31 修复；用户此前说过还有其他问题没报，接手后仍先问用户具体问题，不要急着打包。**

## 5. Windows 打包现状

- 用户机器上的项目副本：`D:\杂物\eupb-reader`（**不是** `C:\epub-reader`，注意中文路径）。
- 用户 Windows 工具链已就绪并验证过：rustc 1.97.1 MSVC、Node 22、pnpm 11。
- 更新副本 + 打包的标准命令（PowerShell）：

```powershell
robocopy "\\wsl.localhost\Ubuntu-25.04\home\herenfor\test\epub-reader" "D:\杂物\eupb-reader" /E /XD node_modules .pnpm-store dist .pw-browsers .pw-libs src-tauri\target /NFL /NDL /NJH
cd "D:\杂物\eupb-reader"
.\scripts\build-windows.ps1
```

- 产物：`src-tauri\target\release\epub-reader.exe` + `bundle\nsis\*-setup.exe`。
- 版本号三处同步：`src-tauri/tauri.conf.json`、`package.json`、`src-tauri/Cargo.toml`（当前 0.1.2）；`build-windows.ps1` 会自动从 `tauri.conf.json` 读取版本号生成安装包路径，不再硬编码。
- 注意：`eupb-read/`（项目根旁）是用户的 git 旧快照，**源码唯一真源是 `epub-reader/`**，改代码只改这里。

## 6. 待办 / 可选优化（历史会话遗留，用户未确认）

- 标准页 x/y 显示（第 x/y 标准页）、标准页字数设置（800/1000/1200）
- 装饰页（分隔图等）深色模式压暗选项
- Tauri 标题栏定制（titleBarStyle overlay）
- 未来自动化打包：GitHub Actions Windows runner（用户曾问过 WSL 交叉打包，因网络/沙箱阻力放弃，主机打包为主）
