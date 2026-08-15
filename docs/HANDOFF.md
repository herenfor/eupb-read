# 交接文档（供新对话接手）

> 最后更新：本会话结束前。项目：`/home/herenfor/test/epub-reader`
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
pnpm test      # vitest 单测，当前 103 项全绿（src/**/*.test.ts）
pnpm build     # tsc 类型检查 + vite 生产构建（交给用户前必跑）
pnpm dev       # 浏览器开发模式，端口 5517
```

**无头浏览器实测**（环境无系统字体/浏览器，用项目内便携 Chromium）：

```bash
export LD_LIBRARY_PATH=/home/herenfor/test/epub-reader/.pw-libs/root/usr/lib/x86_64-linux-gnu
export PLAYWRIGHT_BROWSERS_PATH=/home/herenfor/test/epub-reader/.pw-browsers
npx tsx scripts/img-repro.ts    # 七菜04 Section03：全屏图 p034 + 分隔图 kugiri 渲染盒实测
npx tsx scripts/w90-repro.ts    # width:% 盒子在 1100/800/650 三窗口的宽度实测
```

> 中文路径下的书需要用 `readFileSync` 读取；脚本里已有范例。

### 环境坑（新对话务必知道）

1. **沙箱**：只能写 `/home/herenfor/test/` 工作区；无 sudo/root；`~/.cache`、`~/.cargo` 等家目录不可写（装工具必须装进项目内，如曾经的 `.toolchain/`，已删除）。
2. **网络**：间歇性断连（TLS reset/eof），下载务必带重试+断点续传（`curl -C - --retry`）。
3. **端口**：5517 可用；1420 及 8xxx 中部分端口被 Hyper-V 保留，起测试服务器避开。
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

**用户已明示还有别的问题没报**（"因为还有其他的问题"）——接手后第一件事应是问用户要具体问题，而不是先打包。

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
- 版本号三处同步：`src-tauri/tauri.conf.json`、`package.json`、`src-tauri/Cargo.toml`（当前 0.1.1）；`build-windows.ps1` 会自动从 `tauri.conf.json` 读取版本号生成安装包路径，不再硬编码。
- 注意：`eupb-read/`（项目根旁）是用户的 git 旧快照，**源码唯一真源是 `epub-reader/`**，改代码只改这里。

## 6. 待办 / 可选优化（历史会话遗留，用户未确认）

- 标准页 x/y 显示（第 x/y 标准页）、标准页字数设置（800/1000/1200）
- 装饰页（分隔图等）深色模式压暗选项
- Tauri 标题栏定制（titleBarStyle overlay）
- 未来自动化打包：GitHub Actions Windows runner（用户曾问过 WSL 交叉打包，因网络/沙箱阻力放弃，主机打包为主）
