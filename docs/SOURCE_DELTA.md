# 隔离副本相对源仓的变化

本文件是跨对话交接的首要状态页，用于回答：“`epub-reader` 相比真实源仓改了什么、是否验证、是否已经同步？”

## 路径映射

- 隔离副本：`<PROJECT_ROOT>/epub-reader`
- 真实源仓：`<PROJECT_ROOT>/eupb-read`
- 用户口头所称 `epub-read` 在当前磁盘上的实际名称为 `eupb-read`。
- AI 不得修改、提交或推送真实源仓。

## 当前比较基线

- 源仓提交：`e8aabcdeb03543402338aee00fb2e33d52e39841`
- 提交时间：`2026-08-18T02:31:53+08:00`
- 提交说明：`fix: use u64 for shelf timestamps (Tauri IPC rejects u128)`
- 分支与标签：真实源仓 `main`、`origin/main` 和标签 `v0.1.6` 均指向该提交。
- 基线结论：排除依赖、构建产物、浏览器、Rust target 和本地复现文件后，交接检查时两边代码完全一致。

## 当前未同步变化

状态：**真实源仓仍以 `v0.1.6` 为比较基线；隔离副本已整理为 `0.1.8` 测试发布候选，包含 B-023～B-049、链接书库重构、桌面单实例和对应文档，当前全量 Vitest 基线为 319/319、Rust 为 13/13，等待用户同步到 Windows 主机编译分发并完成实机验收。**

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `docs/PROJECT_CONTEXT.md` | 更新 | 基线推进到 `e8aabcd`，记录 0.1.6、当前隔离副本 186 项测试、B-027 CSS 提交与 bgcolor 契约 | 与真实源仓、版本文件核对；全量 186/186 | 是 |
| `docs/tasks/active/version-0.1.6-development.md` | 更新 | 将 0.1.6 从“开发中/未同步”改为“已同步，待 Windows 发布状态确认” | 与 `main`、`origin/main`、`v0.1.6` 核对 | 是 |
| `docs/tasks/active/import-performance-duplicates-and-progress.md`、`custom-fonts-css-and-select-all.md`、`reader-history-back.md`、`bookmark-feature.md` | 更新 | 补齐源仓提交和同步状态；Windows 安装包未获确认的项目仍保留待确认 | 与 0.1.6 提交历史核对 | 是 |
| `src/render/paginator.ts` | 更新 | B-023：百分比 margin 主路径改为 Typed OM 最终级联；B-024：C-18 正对称 margin 居中豁免收窄到 fit/max-content 原始意图；B-025：computed-right 对齐行可见 inline 盒尾随 U+3000/NBSP 越界时使用几何门控原子化并在失败时事务式恢复；恢复移除 per-measure 标记，且先筛空白再读取样式 | 定向 19/19、全量 184/184、tsc、Vite、三本实书 Chromium 矩阵 | 是 |
| `src/render/paginator.test.ts` | 更新 | B-023/B-024 回归基础上，新增 B-025 尾随宽空白、可见盒、computed-right（逻辑 end 保守跳过）、实际越界与原子化回滚决策及生命周期标记恢复测试 | 定向 19/19、全量 184/184 | 是 |
| `docs/BUGFIX_LOG.md`、`docs/rendering-layers.md` | 更新 | B-022 改为部分修复并新增 B-023/B-024；C-16 登记最终级联与安全回退，C-18/C-24 登记对称 margin 边界 | 与代码和真实验证记录核对 | 是 |
| `docs/tasks/active/README.md`、`toc-percent-margin-resilience.md`、`toc-symmetric-margin-regression.md` | 更新/新增 | 登记 B-023/B-024 待用户审核状态、验收证据与风险 | 任务内验证表 | 是 |
| `docs/tasks/active/toc-inline-box-overflow.md` | 新增 | 登记 B-025/C-25 的根因、门控、生命周期、双视口验收和 Windows 待确认项 | 与代码、实书 Chromium 输出核对 | 是 |
| `docs/PROJECT_CONTEXT.md` | 更新 | 测试基线更新为 16 文件、185 用例，并记录 computed-right 行内盒 L5 补偿、end/RTL 保守边界与 B-026 历史契约 | 全量 Vitest 185/185 | 是 |
| `src/App.tsx` | 更新 | B-026：抽取最多 10 步的统一历史快照与只执行 href 的跳转函数；目录、书签和 paginator 内部链接按有效目标分别保证单次入栈，无效跨章不记录 | 真实 Chromium 跨章/fragment/invalid 撤销，tsc、Vite | 是 |
| `src/ui/ReaderView.tsx` | 更新 | B-026：通过 latest ref 转发 paginator 的已解析 href 与 before 通知，修复首次 loading 闭包导致的历史失效 | 真实 Chromium 跨章/fragment 撤销 | 是 |
| `src/render/paginator.ts` | 更新 | B-026：有效普通内部链接和存在目标的 fragment 改变位置前通知一次历史；外链/脚注、缺失 fragment 不通知，fragment 保持原地 hash/jump | Paginator 20/20、全量 Vitest 185/185 | 是 |
| `src/render/paginator.test.ts` | 更新 | 新增有效/无效内部路径、存在/缺失 fragment、外链通知边界回归；保留 B-025 生命周期和布局回归 | 定向 20/20、全量 185/185 | 是 |
| `docs/MODULE_CONTRACTS.md`、`docs/BUGFIX_LOG.md`、`docs/tasks/active/reader-history-internal-links.md`、`docs/tasks/active/README.md` | 新增/更新 | 登记 B-026 的 latest-ref、单次快照、fragment 撤销与外链/脚注排除契约 | 与代码和真实 Chromium 输出核对 | 是 |
| `docs/SOURCE_DELTA.md` | 更新 | 保留上述 0.1.6 交接文档差异，同时登记 B-023 待同步代码与文档 | 本文件、只读基线核对 | 是 |
| `src/ui/MenuPanel.tsx`、`src/ui/menuPanel.test.ts` | 更新 | B-027 将 custom CSS 改为本地 draft，只有“保存并应用”提交；支持清空、外部值同步与无改动禁用 | 定向/全量 Vitest；Chromium 输入 5 字符期间 iframe load=0，保存与清空各一次 | 是 |
| `src/render/sanitize.ts`、`src/render/sanitize.test.ts` | 更新 | B-027 将浅色安全 bgcolor 合入同一 override style 的默认 background-color，移除已消费 legacy 属性，userCss 保持最后；深色/纸色忽略且不重置背景图 | sanitize 49/49；合成章节 Chromium computed 背景与主题矩阵 | 是 |
| `docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/tasks/active/custom-css-commit-and-theme-bgcolor.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md` | 新增/更新 | 登记 B-027/C-26、186 测试基线与多个 CSS 预设 optional backlog | 文档链接/术语自检；全量 Vitest 186/186、tsc、Vite build | 是 |
| `src/ui/Toolbar.tsx`、`src/styles.css` | 更新 | B-028 按左右控件实际 layout `scrollWidth` 取最大值写入对称侧轨，宽屏标题可完整显示时居中；720px 以下切回不对称 max-content 轨道并单行省略 | Chromium 1080×760 标题中心差 0px；640×480 UI scale 1/1.3 按钮与标题无重叠 | 是 |
| `docs/MODULE_CONTRACTS.md`、`docs/BUGFIX_LOG.md`、`docs/tasks/active/toolbar-narrow-layout.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md`、`docs/PROJECT_CONTEXT.md` | 新增/更新 | 登记 B-028 对称侧轨、窄屏 fallback、中心契约和验收矩阵 | 文档链接自检；全量 Vitest、tsc、Vite build | 是 |
| `src/render/cssRewrite.ts`、`src/render/cssRewrite.test.ts` | 更新 | B-029 增加带 context nonce 的 quote-aware CSS comment protector；递归 `@import` 共享保护 context，注释外才执行 import/url/width 改写，inline width helper 保持同一边界 | cssRewrite 24/24；递归/未闭合/quoted URL/注释泄漏/占位符碰撞回归 | 是 |
| `src/render/sanitize.ts`、`src/render/sanitize.test.ts`、`src/render/paginator.ts`、`src/render/paginator.test.ts` | 更新 | B-029 的 ancestor width、纯图片尺寸和 float guard 改用注释安全 authored-property 判断 | 定向 96/96；全量 Vitest 197/197、tsc、Vite build | 是 |
| `docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/tasks/active/css-comment-boundaries.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md`、`docs/PROJECT_CONTEXT.md` | 新增/更新 | 登记 B-029/C-27、nonce sentinel 注释边界契约与 0.1.6 活动任务基线；补录 sanitize 外链 CSS Chromium 端到端证据 | 文档结构自检；自动化 17 文件 197/197、Chromium hiddenReads=0/CSSOM/ComputedStyle | 是 |
| `src/render/paginator.ts`、`src/render/paginator.test.ts` | 更新 | B-030：末尾递归媒体-only float 以首列碎片 top + `scrollHeight` 推算未分片底部，临时收紧 margin-top，并用候选/后代视觉 rect、列边界、前序兄弟碰撞与 scrollLeft 做事务门控 | paginator 23/23；目标书 900×650、1280×800、640×480 Chromium | 是 |
| `docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/MODULE_CONTRACTS.md`、`docs/tasks/active/trailing-media-float-overflow.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md`、`docs/PROJECT_CONTEXT.md` | 新增/更新 | 登记 B-030/C-30、199 测试基线、四本相邻实书回归及 title wrapper 仅诊断边界 | 文档链接/状态自检；全量 Vitest 17 文件 199/199、tsc、Vite build、Chromium | 是 |
| `src-tauri/src/linked_library.rs`、`src-tauri/src/lib.rs` | 新增/更新 | B-031：以可同步记录、设备绑定和缩略图索引替代复制式书库；实现流式哈希、受限 ZIP 元数据、批量集中提交、变更检测、raw source/cover、精确重新关联、进度/书签、100 MiB LRU 与崩溃孤立缓存清理；移除旧复制式 runtime 命令 | Rust 9/9、`cargo fmt --check`、`cargo check --quiet` | 是 |
| `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/capabilities/default.json`、`package.json`、`pnpm-lock.yaml` | 更新 | B-031：加入 Tauri dialog/fs 插件及最小文件选择、存档文本读写权限；锁文件同步 | Cargo/TypeScript/Vite 生产构建通过 | 是 |
| `src/ui/shelf.ts`、`src/App.tsx`、`src/ui/ShelfView.tsx`、`src/styles.css` | 更新 | B-031：统一链接书库接口、一次性批量合并、重复/失败提示、缺失源文件徽标与重新定位、桌面存档选择、卡片 memo 与离屏布局隔离；书签确认不再以旧完整快照覆盖进度；浏览器保留 IndexedDB 测试后端 | `linkedShelf` 3/3；全量 218/218；TypeScript/Vite build | 是 |
| `src/ui/libraryArchive.ts`、`src/ui/libraryArchiveBridge.ts` 及测试 | 新增 | B-031：v1 无路径 JSON 存档、严格 schema/设置白名单、路径泄漏拒绝、按哈希合并较新进度/书签与 Tauri/浏览器投影 | 存档定向 9/9；全量 218/218 | 是 |
| `src/ui/thumbnail.ts`、`src/ui/thumbnail.test.ts` | 新增 | B-031：近视口门控、全局四并发、取消与 Blob 生命周期、最大 240×360 JPEG/WebP 派生 | 定向 5/5；全量 218/218 | 是 |
| `src/ui/progressWriter.ts`、`src/ui/progressWriter.test.ts` | 更新 | B-031：每本书首次稳定进度立即提交，后续 750ms 合并；在途 batch 冻结，更新值留待下一批，生命周期边界 flush | 定向 5/5；全量 218/218 | 是 |
| `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/src/lib.rs` | 更新 | B-032：桌面目标加入官方单实例插件并最先注册；第二次启动关闭自身，已有 `main` 窗口依次 show/unminimize/focus；浏览器开发路径不变 | Rust 10/10、`cargo fmt --check`、`cargo check` | 是 |
| `README.md`、`docs/PROJECT_CONTEXT.md`、`docs/HANDOFF.md`、`docs/tasks/active/version-0.1.6-development.md`、`docs/tasks/active/desktop-single-instance.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | B-032：记录单实例外壳契约、官方插件选择、当前 10 项 Rust 基线、验证与 Windows 双启动待确认项 | 文档/实现接口核对 | 是 |
| `README.md`、`docs/HANDOFF.md`、`docs/tasks/active/linked-library-refactor.md`、`docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/PROJECT_CONTEXT.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md` | 新增/更新 | 登记 B-031 架构、数据边界、自动化证据、跨 JSON 崩溃边界、单本超大 EPUB 非目标及 Windows 100+ 本待验收项；移除交接入口中的复制式书库现状描述 | 文档与实现接口核对；全量前端/Rust/构建通过 | 是 |
| `src/ui/readerNavigationHistory.ts`、`src/ui/readerNavigationHistory.test.ts` | 新增 | B-033：纯 TS back/forward 双栈，每栈最多 3 条；普通新跳转清空 forward，后退/前进对称交换当前位置 | 定向历史测试 3/3 | 是 |
| `src/App.tsx`、`src/ui/ReaderView.tsx`、`src/render/paginator.ts`、`src/render/paginator.test.ts`、`src/ui/Toolbar.tsx`、`src/styles.css` | 更新 | B-033：同步 ready ref、初始基线单次捕获门、display-ready transition gate、同章 fragment settled 通知、anchor 优先恢复、转场禁写旧进度、实际页状态触发进度写入、前进/后退胶囊按钮及动态 intrinsic 侧轨测量 | 定向 31/31、全量 22 文件 221/221、`tsc --noEmit`、Vite build、WSL Chromium 交互 | 是 |
| `docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/PROJECT_CONTEXT.md`、`docs/tasks/active/reader-navigation-history-forward.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-033 的 ready 竞态、双栈与恢复契约、验证边界和用户审核状态 | 文档/接口核对 | 是 |
| `src/render/paginator.ts`、`src/render/paginator.test.ts` | 更新 | B-034：目录顶层无作者水平 margin 的 computed left/right float，在宽容器写入物理 float 侧 40rem 版心 inset；纯函数覆盖 right/left、窄容器及作者 margin/全页/全宽意图/过宽盒跳过；full-width intent 排除 reader 注入 stylesheet、过滤当前不生效条件，并置于 fit/max-content 分支之后 | paginator 28/28；全量 22 文件 226/226；`tsc --noEmit`、Vite build、目标书三视口与三本相邻实书 Chromium 通过 | 是 |
| `docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/MODULE_CONTRACTS.md`、`docs/tasks/active/toc-top-float-containment.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md`、`docs/PROJECT_CONTEXT.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-034/C-31、marginFixes 恢复契约、全宽意图保守边界与验证结论 | 文档/接口核对；全量测试、构建与实书 Chromium 通过 | 是 |
| `src/styles.css`、`src/ui/footnoteStyles.test.ts` | 新增/更新 | B-035：宿主脚注弹层仅对 `.duokan-footnote-content` 隐藏 `li[value]` 生成 marker、清零列表 padding，并取消该结构直接图片容器的旧负左 margin；普通 `.footnote-html ol/ul` 保持编号与缩进 | CSS 契约 2/2；定向 91/91；全量 Vitest 23 文件 228/228；`tsc --noEmit`、Vite build；目标书两个图片脚注 WSL Chromium 通过，WebView2 待确认 | 是 |
| `docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/MODULE_CONTRACTS.md`、`docs/tasks/active/footnote-rich-content-marker.md`、`docs/tasks/active/README.md`、`docs/tasks/active/version-0.1.6-development.md`、`docs/PROJECT_CONTEXT.md`、`docs/HANDOFF.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-035/C-32、富脚注跨 iframe 列表语义和普通列表保护边界 | 文档/接口核对；测试与构建结果见任务收尾 | 是 |
| `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` | 更新 | 将隔离副本四处构建版本统一提升为 0.1.7 测试发布候选；Cargo.lock 只修改 epub-reader 根包 | 版本一致性、Cargo metadata、全量前端/Rust 复验 | 是 |
| `docs/RELEASE_0.1.7.md`、`docs/tasks/active/version-0.1.7-release-candidate.md`、`docs/PROJECT_CONTEXT.md`、`docs/HANDOFF.md`、`docs/tasks/active/README.md`、相关活动任务 | 新增/更新 | 建立 0.1.7 当前入口、Windows 安全同步/构建命令、排除项与发布包验收矩阵；0.1.6 任务冻结为历史入口 | 文档、命令和路径核对 | 是 |

0.1.7 候选收口时，`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 Cargo 锁文件中的本项目版本曾统一为 `0.1.7`；当前版本以本文件顶部状态和 0.1.8 收口段为准。

0.1.7 发布候选当时的复验：前端 Vitest 23 文件 228/228、Vite production build、Rust 10/10、`cargo fmt --check` 与 `cargo check --locked` 均通过；`cargo metadata --locked --no-deps` 识别 `epub-reader@0.1.7`。该段仅保留阶段历史，当前 Windows 发布入口为 0.1.8。

交接复验：Vitest 16 个文件 174/174、TypeScript、Vite 生产构建、`cargo check`、Rust 2/2 单测及 `cargo fmt --check` 均通过。B-023 验证：Vitest 16 个文件 177/177，真实 Chromium 双视口目录为 1/1 页。B-024 本轮验证：Vitest 16 个文件 179/179、`tsc --noEmit`、Vite 生产构建通过；侦探少年目录在 1280×800 与 900×650 均为 1/1 页，`Contents` 左缘恢复到 0.1.3 的 344px/154px；C-18 简介灰框宽屏、窄屏与 20px 字号仍逐列居中；B-023 的 70% margin 目录仍为 1/1 页。B-025 本轮验证：全量 Vitest 16 个文件 184/184、`tsc --noEmit`、Vite 生产构建通过；目标书 1280×800 色块右缘回到 960px 且 1/1，900×650 当前列右缘回到 770px、状态 1/2，键盘下一页可达 2/2，resize 后 per-measure 标记恢复并再次写回，最后“后记”不再落入不可达残片；B-023 与 B-024 均无回归。B-026 本轮验证：全量 Vitest 16 个文件 185/185、`tsc --noEmit`、Vite 生产构建通过；目标书跨章 iframe 链接和选择器书同章 fragment 均启用历史，撤销后恢复原位置且单次操作无重复历史。本轮未修改 Rust/Tauri，因此未重复运行 cargo。此前真实 Chromium 已验证导入判重与进度、全选、自定义字体/CSS、书签。Windows WebView2/NSIS 是否已重新编译、打包和分发仍待用户确认。

B-027 收尾：全量 Vitest 17 个文件 186/186、`tsc --noEmit`、Vite build 通过；Chromium 已验证编辑期间无 iframe 重载、保存与清空各触发一次，以及无作者 `!important` 的合成章节中浅色用户背景覆盖和深色/纸色主题回退。多个 CSS 预设仍为 optional backlog，不属于本次实现。

B-028 收尾：Chromium 1080×760 宽屏标题中心与 toolbar 中心差 0px（UI scale 1/1.3），书架“EPUB 阅读器”中心差 0px；640×480 窄屏 UI scale 1/1.3 均验证按钮完整且无重叠，窄屏 `nowrap`/ellipsis/9px，合成超长标题为 `439 > 315`、`472 > 171`。全量验证结果见本任务记录。

B-029 当前收尾：自动化定向 cssRewrite 24/24、sanitize 51/51、paginator 21/21（共 96/96），全量 Vitest 17 文件 197/197，`tsc --noEmit` 与 Vite build 通过；WSL Chromium 已完成 sanitize 外链 CSS 端到端验证：hiddenReads=0，注释逐字保留，CSSOM 仅有 `.real`，hidden 为默认色，real 保持蓝色与背景 URL。剩余为现有测试书普通回归和 Windows WebView2/安装包确认。

B-030 当前收尾：paginator 定向 23/23，全量 Vitest 17 文件 199/199，`tsc --noEmit` 与 Vite build 通过。目标书 900×650 为 1/1（`.fr` margin-top `-134.647px`），1280×800 为 1/1 且 margin-top `0px`；640×480 为 1/2，剩余两列来自目录主体自身。B-019、B-023、B-024、Sumeragi 900×650 实书回归均为 1/1。title.xhtml whole-page wrapper 仅诊断未修；Windows WebView2/安装包确认仍待用户。

B-031 当前收尾：前端 Vitest 21 文件 218/218、TypeScript/Vite 生产构建、Rust 9/9、`cargo fmt --check` 与 `cargo check --quiet` 均通过。桌面复制式书库命令已退出 runtime，链接源文件、便携存档、缺失源重新定位和有界缩略图已接入；每本书首次进度立即提交，启动会清理崩溃遗留的孤立缩略图/临时文件；旧 WSL/Windows `dev.epubreader.app` 缓存目标均不存在。Windows 发布包的 100+ 本/数 GB 性能、dialog/fs、拖放、重新定位和卸载源文件安全仍待用户实机确认。

B-032 当前收尾：桌面目标新增 `tauri-plugin-single-instance 2.4.3`，并作为 Tauri builder 首个插件注册。第二次启动通知会按 show、unminimize、focus 恢复已有 `main` 窗口，调用错误不会导致现有实例退出；浏览器 `pnpm dev` 不加载该插件。`cargo fmt --check`、Rust 10/10、`cargo check` 通过。仍需 Windows Tauri dev/发布包验证普通重复启动与最小化后重复启动各只保留一个进程/窗口。

B-033 当前收尾：阅读历史/paginator/progress writer 定向 31/31，全量 Vitest 22 文件 221/221，`tsc --noEmit` 与 Vite build 通过。代码实现使用最多 3 条 back/forward 双栈、初始保存位置基线、display-ready/同章 settled 稳定门控、anchor 优先恢复，并以实际页状态而非仅整数百分比触发进度写入。WSL Chromium 已验证首次跳转、连续 fragment、双向恢复和胶囊布局；Windows WebView2 人工确认待用户执行。

B-034 当前收尾：paginator 定向 28/28、全量 Vitest 22 文件 226/226、`tsc --noEmit` 与 Vite build 通过；新纯门控仅允许无作者水平 margin、宽度不超过 40rem 的 viewer 直接 `reader-top` float 进入，写回随 `marginFixes` 恢复。目标书 1280/900 已收回版心且保持 1/1，640 保持自然两页；玩具堂、赤月、すめらぎ相邻实书无回归。Windows WebView2 人工确认待用户执行。

B-035 当前收尾：脚注宿主 CSS 契约定向 2/2、脚注/样式/消毒/分页定向 91/91；全量 Vitest 23 文件 228/228，`tsc --noEmit` 与 Vite build 通过。目标书后记两个图片脚注已在 WSL Chromium 实际点击验证：生成 marker 隐藏、padding 为 0，图片与内容左缘一致；普通脚注列表保护回归通过。Windows WebView2 仍待人工确认。

## 本轮新增未同步变化（B-036、B-037）

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `src/render/blobOwnership.ts`、`src/render/paginator.ts` | 新增/更新 | 按 sanitize/load 局部集合登记外链 CSS Blob URL；成功提交 iframe 后转为当前章节所有权，过期、异常、换章和 dispose 幂等撤销；`measure` 在异步边界核对 loadSeq、document/viewer 身份 | 生命周期定向 4/4、paginator 定向回归与 tsc；全量 Vitest/build 待收尾 | 是 |
| `src/ui/ReaderView.tsx`、`src/App.tsx` | 更新 | ReaderView cleanup 先 dispose paginator 再 revoke ResourceServer；返回书架 flush 后切视图，React 提交卸载后清空书籍会话状态 | 代码核对；React StrictMode/Windows WebView2 待人工确认 | 是 |
| `src/render/*lifecycle.test.ts`、`src/render/blobOwnership.test.ts`、`src/render/resources.test.ts` | 新增/更新 | 覆盖 CSS URL 成功换章、失败、过期、dispose、VisibilityGate 代次、共享 URL revokeAll 与幂等 | 定向 40/40；全量 Vitest 25 文件 236/236 | 是 |
| `docs/tasks/active/reader-session-lifecycle-and-blob-ownership.md`、`docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md` | 新增/更新 | 登记 B-036 生命周期、所有权边界、页面中心仅观察锚点契约与验证边界 | 文档结构核对；全量 Vitest/tsc/Vite 通过 | 是 |
| `src/render/textAnchor.ts`、`src/render/paginator.ts`、`src/ui/ReaderView.tsx`、`src/App.tsx`、`src/ui/readingProgress.ts` | 新增/更新 | B-037：页面中心仅 caret 采样；当前章节自然布局后用 code-point 文本 offset/snippet→Range 列恢复，legacy/page 兜底，首列不受锚点影响；当前章分子消除父子重复计数并修正 linear=no | 定向 70/70、全量 Vitest 27 文件 250/250、tsc/Vite；WSL Chromium 视口、重开与连续字号矩阵通过，Windows WebView2 待人工确认 | 是 |
| `src/ui/shelf.ts`、`readerNavigationHistory.ts`、`storage.ts`、`libraryArchive*.ts`、对应测试、`src-tauri/src/linked_library.rs` | 新增/更新 | B-037：Shelf/书签/历史/浏览器存储/portable v1/Rust IPC 统一 optional `anchorTextOffset`/`anchorTextSnippet`；旧缺字段归一 null，文本-only sentinel 不跨 Rust usize 边界，snippet/数值严格校验 | archive/history/shelf/Rust round-trip 回归；Rust 11/11、fmt/check 通过 | 是 |
| `docs/tasks/active/text-content-anchor-and-progress.md`、`docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/tasks/active/README.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-037/C-33 的自然分页、数据兼容、恢复优先级和 Chromium/WebView2 边界 | 文档与接口核对；自动化及 WSL Chromium 结果同上 | 是 |

## B-038 同章导航不重载

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `src/render/paginator.ts`、`src/render/paginator.test.ts` | 更新 | 新增当前已完成章节的同步 direct 导航：fragment/章首 hash 处理、text→legacy→page 恢复、异常事务回滚；成功不触发 load/sanitize/measure/recompute，失败保持当前页/anchor/hash | 定向 paginator/lifecycle 40/40；全量 Vitest 28 文件 258/258、tsc、Vite build | 是 |
| `src/ui/ReaderView.tsx`、`src/App.tsx` | 更新 | ReaderHandle 暴露同章原子入口；App 对 TOC/书签/history 做 ready 同章 direct 与跨章/未 ready reload 分流，历史仅在 direct 成功后提交 | 定向 history/progress/helper；全量 Vitest 258/258、tsc、Vite build | 是 |
| `src/ui/sameChapterNavigation.ts`、`src/ui/sameChapterNavigation.test.ts` | 新增 | 纯 helper 覆盖 direct/reload 判定、direct 失败不提交历史、back/forward 成功后采用 transition，不引入 React 测试依赖 | helper 3/3；全量 Vitest 28 文件 258/258 | 是 |
| `docs/tasks/active/same-chapter-navigation.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-038、C-33 的同章 direct/失败事务/跨章重载契约和非目标范围 | 文档链接/差异自检；全量 Vitest 258/258、tsc、Vite build | 是 |

## B-039 增量章节字数统计与进度 baseline 保护

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `src/ui/chapterCounts.ts`、`src/ui/chapterCounts.test.ts` | 新增 | generation-bearing unknown/estimated/measured collection；measured 优先、linear=no 排除、code-point safe count、complete/approximate summary、`resolveProgressPct` baseline 保护 | 定向及全量 Vitest 269/269、tsc、Vite build | 是 |
| `src/ui/chapterCountJob.ts`、`src/ui/chapterCountJob.test.ts` | 新增 | 可注入 requestIdleCallback/setTimeout 的可取消 job；每 slice 最多处理一章；结构排除 script/style、hidden、aria-hidden、明确脚注；缺资源/parser 失败 estimated 0 并留诊断；generation/book/server 防 stale callback | idle abort、A→B stale、一次一章、缺资源/parser 回归；定向及全量通过 | 是 |
| `src/render/textAnchor.ts` | 更新 | 导出纯结构排除判据，供 measured visible index 与 provisional count 复用；computed CSS hidden 仍只由 measured 路径处理 | textAnchor 4/4；全量 269/269 | 是 |
| `src/App.tsx` | 更新 | 删除打开书籍时整书同步 chapterChars 扫描；接入 counts ref/state、当前 ready anchor.totalChars measured、idle job、session generation、取消和 baseline progress；未 complete 沿用 baseline，complete 后更新 | 相关定向 69/69；全量 269/269、tsc、Vite build | 是 |
| `src/render/asyncWait.ts`、`src/render/asyncWait.test.ts`、`src/render/paginator.ts` | 新增/更新 | fonts 与 iframe defaultView double-rAF 可取消等待；先完成者清 timer，load/cleanup/dispose abort 旧 controller/rAF，最终保留 loadSeq/doc/viewer 校验 | 定向及全量 269/269、tsc、Vite build | 是 |
| `src/render/resources.ts`、`src/render/resources.test.ts` | 更新 | 新增默认 4 MiB/32 项 text LRU，按 text.length×2 估算，单条超限不缓存，decoder/stats 可测；revokeAll 清 entries/bytes，URL cache 契约不变 | LRU hit/淘汰/超大/revoke 回归；全量 269/269 | 是 |
| `docs/tasks/active/incremental-chapter-counts-and-progress.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-039、provisional 不参与布局、未访问 CSS hidden 只能估算、baseline/取消/LRU 边界与非目标（CSS cache/预加载/流式 ZIP/Rust） | 文档链接/术语自检；Vitest 31 文件 269/269、tsc、Vite build | 是 |

## B-040 快速设置重载与锚点 snapshot

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `src/ui/settingsReload.ts`、`src/ui/settingsReload.test.ts` | 新增 | 可取消 150ms debounce；连续设置只执行最后 task，章节切换可取消 pending timer | debounce/取消 2/2 | 是 |
| `src/ui/ReaderView.tsx` | 更新 | settings/userFonts identity 变化合并为最后一次 reload；章节、book/server cleanup 与 dispose 取消 timer；切章记录最新 settings，避免额外 reload | 与 paginator lifecycle 定向回归、tsc | 是 |
| `src/render/paginator.ts`、`src/render/paginator.settings.test.ts` | 更新/新增 | `reloadWithSettings` 在 await/load 前一次性复制 `ReadingAnchor` 与 current page，向 `load` 传 snapshot 和 fallback；无 document 时保留既有 anchor | B-040 定向 44/44；B036 stale gate/Blob 回归保持；Chromium 测试书 900×650 快速双字号+仍第 2/3 页且旧 snippet 可见 | 是 |
| `docs/tasks/active/reader-settings-reload-debounce.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-040，记录设置合并、anchor snapshot、过期 reload 防护与非目标范围，并登记 Chromium 矩阵结论 | 链接/术语自检；全量 Vitest 33 文件 273/273、tsc、Vite build | 是 |

## B-041 多看普通图文容器误判为全页图

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `src/render/sanitize.ts`、`src/render/cssRewrite.ts`、`src/render/paginator.ts` | 更新 | `.duokan-image-single` 不再仅因类名获得全页图语义：恢复普通图文/图注的作者布局与通用 width 规则；明确 fullscreen 类、纯单图和 B-013 SVG 的页面级全页路径保持 | 新回归旧实现 2 项失败；定向 Vitest 3 文件 114/114、目标 EPUB Chromium 1280×800 已复核普通图文与图注无越界；整组全量 Vitest 34 文件 304 测试、`tsc --noEmit`、`pnpm build`（95 modules）通过 | 是 |
| `src/render/sanitize.test.ts`、`src/render/cssRewrite.test.ts` | 更新 | 增加普通 single 图文容器、显式 fullscreen 与页面级纯图/SVG 边界回归 | 同上 | 是 |
| `docs/tasks/active/epub-guide-compatibility.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 建立 B-041～B-044 统一任务，记录 B-041 根因、C-34 冲突台账、验证和后续三项的未处理边界；收尾时统一四项自动化/WSL Chromium 状态 | 文档与代码/测试术语核对；整组全量 34 文件 304 测试、tsc、build 通过 | 是 |

## B-042 连续百分比 float 组级版心门控

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `src/render/paginator.ts` | 更新 | C-31 现在识别连续直接 sibling 的同向百分比 float 栅格；只对总和 99..101 且至少两项的明确作者组跳过逐项版心 inset；现代 Typed OM 的明确 px 直接否决，旧 CSSOM 只处理简单可判定级联，reader overrides/复杂选择器/未知条件/不可读源保守不豁免 | 旧实现新增回归 36/5（5 项失败）；级联边界补测后 paginator 48/48；目标 EPUB 1280×800/900×650 前五个 opacity float 均同一行、无 margin 写回；整组全量 34 文件 304 测试、tsc、build 通过 | 是 |
| `src/render/paginator.test.ts` | 更新 | 覆盖 20×5、50×2、33.333×3 容差、单 float/20×2、不满整行、混合 px/%、方向/普通块/clear 断组、Typed OM px/无值、inline important/stylesheet 覆盖、reader overrides、复杂伪类、未知 CSSOM 和最终级联 | 定向 paginator 48/48 | 是 |
| `docs/tasks/active/epub-guide-compatibility.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md` | 更新 | 登记 B-042/C-35 的组级门控边界、Typed OM 优先级、旧 CSSOM 保守风险、reader userCss 不可区分边界、B-034 回归约束；补写 1280×800/900×650 前五个 opacity float 的同一行 Chromium 证据 | 文档/代码术语核对；目标 EPUB Chromium、全量 34 文件 304 测试、tsc、build 已完成；Windows WebView2 待用户 | 是 |

## B-043 EPUB 3 NAV fragment 与多级目录

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `src/core/nav.ts`、`src/core/nav.test.ts` | 更新 | EPUB 3 `epub:type` 增加命名空间/属性回退；最近列表搜索在嵌套 li 边界剪枝，父项只读取自己的链接/文字，混合 `ol/ul` 保持文档顺序 | 旧实现父 li 回归失败；修复后 NAV 12/12（含 XML 直接嵌套 li） | 是 |
| `src/core/book.ts`、`src/test/book.test.ts` | 更新 | 导出 `resolveTocHrefs`；仅在 nav/NCX 基准文档属于 spine 时绑定 `#`/`#id`，无上下文 fragment/外部/空 href 仍禁用 | book 14/14 | 是 |
| `src/ui/TocPanel.tsx`、`src/ui/TocPanel.helpers.test.ts`、`src/App.tsx` | 更新/新增 | 目录递归统计为“项”；按 fragment 精确、章首、同路径顺序返回唯一节点引用，App 传递当前 path+anchor，避免同 XHTML 多项同时高亮 | Toc helper 3/3、TypeScript 通过 | 是 |
| `docs/tasks/active/epub-guide-compatibility.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md` | 更新 | 登记 B-043/C-36、验证边界和 NAV 原本已被正确识别的结论 | 目标 EPUB 1280×800 Chromium：`.toc-count`=`334 项`、`.toc-item`=334，缩进 8/22/36px；正确 `12.4.1`、错误 NCX `14.1`=0；根目录无 disabled、点击后 iframe 有 `nav#toc`、12.4.1 唯一高亮并到 Chapter12-4 第 2/21 页；`iframe :target` 不作为本项断言；整组全量 34 文件 304 测试、tsc、build 通过 | 是 |

## B-044 UA 默认 margin 来源门控

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `src/render/paginator.ts` | 更新 | 新增当前生效 inline/CSSOM 的水平 margin 来源判断；L3 auto margin 临时移除后，明确 UA-only computed margin 跳过 C-04，作者/用户与未知来源保持原路径；涵盖 physical/logical/shorthand，customCss 仍可生效。仅 non-percentage、nonzero/unknown computed margin 的 C-04 候选扫描样式表，零/auto 直接子及 C-16 百分比路径不产生 O(children×rules) 新开销 | 新 B-044 回归在旧实现 4 项失败；修复后 paginator 54/54。目标 EPUB 8.6.5 Chromium：1280×800 两个 blockquote 均 width640/margin312/312、无 fixed，三段严格在每列 40rem；900×650 均 width640/margin122/122、无 fixed，后代无越块。B-023/B-024/Sumeragi 实书回归保持；整组全量 34 文件 304 测试、tsc、build 通过 | 是 |
| `src/render/paginator.test.ts` | 更新 | 覆盖 inline 注释、shorthand/logical、匹配/不匹配规则、当前 media/supports、未知 grouping/不可读 CSSOM、reader customCss、false/true/unknown 补偿门、zero/auto 与 C-16 百分比不扫描边界 | paginator 54/54 | 是 |
| `docs/tasks/active/epub-guide-compatibility.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md` | 更新 | 登记 B-044/C-37、UA blockquote 40px 根因、保守边界、验证状态与不按标签特判的约束 | 文档与实现术语核对；目标 EPUB Chromium、相邻实书回归、全量 34 文件 304 测试、tsc、build 已完成；Windows WebView2 待用户 | 是 |

## B-045 UA 对称 margin 语义保留

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `src/render/paginator.ts` | 更新 | B-044 来源门控之后，新增 `getReaderTopUaSymmetricInsetMaxWidth()`：仅 reader-top、明确 UA-only、非 float/fullpage/百分比且 computed 左右 margin 有限非零对称时，将 border-box 减去双侧 inset 并按 box-sizing 写入临时 max-width；L3 auto margin 继续负责居中，写回纳入现有 marginFixes 恢复 | 新回归旧实现 1 项失败；修复后 paginator 55/55。目标 EPUB Chromium 1280×800 两个 blockquote width/max-width 560px、margin 352/352，每个 fragment 宽 560 且逐列居中；900×650 width 560、margin 162/162、无后代越界 | 是 |
| `src/render/paginator.test.ts` | 更新 | 覆盖 640+40/40→560、窄视口包含块限制、作者 margin、非对称、float、fullpage、百分比、非 reader-top、零 margin 不触发 | paginator 55/55；全量 Vitest 34 文件 305/305 | 是 |
| `docs/tasks/active/epub-guide-compatibility.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md` | 更新 | 单列 B-045/C-38，明确 B-044 只消除右移却吞掉 UA 双侧语义；记录 C-38 的层级、生命周期和非目标边界 | B-041 3.1 图文容器、B-042 opacity float、B-043 12.4.1 NAV、B-023 赤月、B-024 玩具堂、Sumeragi WSL Chromium 回归；全量 Vitest 305/305、tsc、pnpm build（95 modules）通过；Windows WebView2 待用户 | 是 |

## 不属于同步变化

以下内容是本地依赖、构建或测试产物，不应复制进真实源仓：

- `node_modules/`
- `dist/`
- `.pnpm-store/`
- `.pw-browsers/`
- `.pw-libs/`
- `src-tauri/target/`、`src-tauri/target2/`、`src-tauri/gen/`
- `targettmp/`
- `.img-repro.png`
- `.tmptsx/`
- `scripts/repro-redmoon.mjs`（本地实书复现脚本，不属于产品运行时）
- `<PROJECT_ROOT>/测试用epub/` 中的本地测试书
- 一次性截图、日志和临时复现输出

## 后续更新规则

每次完成一项可同步改动后，在“当前未同步变化”中记录：

1. 文件路径；
2. 行为变化与修改原因；
3. 本地验证命令和结果；
4. 是否建议同步；
5. 若是 Bug，关联 `BUGFIX_LOG.md` 的编号。

用户确认已经同步后：

1. 更新新的源仓提交哈希；
2. 从“当前未同步变化”移除已同步项；
3. 在下方追加一次同步历史；
4. 保留未同步的本地实验项。

## 同步历史

- **2026-08-17 `0.1.5` 发布同步**：提交 `4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`，标签 `v0.1.5`；用户确认已在 Windows 编译、打包并分发。
- **2026-08-17 `0.1.5` 文档收尾**：提交 `e349ab50e1a98f893c8de07dcc84fcf86f95f77d`，作为 0.1.6 开发阶段的起始基线。
- **2026-08-17 `0.1.6` 导入与进度**：提交 `323ea717451c1f05cfcb6e5c677550bca85e96a8`，同步 B-020/B-021、内容判重、批量导入优化和进度写入器。
- **2026-08-17 公开仓库准备**：提交 `09a995811a5adf7d9e8c8d765791ff2d45cf9883`，增加 MIT License 并泛化本机路径。
- **2026-08-18 `0.1.6` 功能提交**：提交 `d934588b6518dca819e72d2f129a68225cba6592`，同步书签、自定义字体/CSS、阅读历史返回、封面回退、B-022 和 0.1.6 版本元数据。
- **2026-08-18 `0.1.6` IPC 修复**：提交 `e8aabcdeb03543402338aee00fb2e33d52e39841`，把 Tauri 不支持的 `u128` 书架时间参数改为 `u64`；`main`、`origin/main`、`v0.1.6` 均指向该提交。

## B-046/C-31/C-39：顶层浮动布局单元与完整百分比组版心限宽

| 文件 | 状态 | 变更摘要 | 验证 | 是否同步 |
|---|---|---|---|---|
| `src/render/paginator.ts`、`src/render/paginator.test.ts` | 更新 | 所有顶层 left/right float 先进入 C-31 防火墙，安全单项按40rem投影并保留作者 margin，复杂单项保持原布局且不进入 C-04/C-18；新增独立 `floatLayoutFixes` 生命周期；安全完整百分比组按 40rem 版心写入本轮 px width/首项 inset，几何验收失败整组恢复；覆盖复杂回退、优先级恢复和 C-08 隔离 | paginator 62/62；全量 Vitest 34 文件 312/312；`tsc --noEmit`、`pnpm build`（95 modules） | 是 |
| `docs/tasks/active/epub-guide-compatibility.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/MODULE_CONTRACTS.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-046/C-39、两阶段 float 方案、无 DOM wrapper、复杂组保守回退、生命周期/防火墙契约及 Chromium 实测 | 3.4.4 1280/900、字号 16→20→16、金木犀双视口及相邻书 smoke 通过；Windows WebView2 待用户 | 是 |

## B-047/C-40：显式对称居中作者 margin 的通用门控

| 文件 | 状态 | 变更摘要 | 验证 | 是否同步 |
|---|---|---|---|---|
| `src/render/paginator.ts` | 更新 | 新增 `hasAuthoredSizingIntent` 与 `shouldKeepCenteredAuthorMargins`；在 C-31/C-16/C-18/C-38 后、C-04 前，仅对作者来源明确、无 sizing intent 的对称 `text-align:center` 普通顶层盒保留自然居中；固定/unknown/非对称/percentage/float/fit/fullpage 保守走原路径；reader 内建 `max-width:40rem` 不算作者 sizing | paginator 64/64；目标目录 1280/900 与字号 16→20→16 Chromium 同轴；B-024/B-045/C-18/B-023/B-046/金木犀回归 | 是 |
| `src/render/paginator.test.ts` | 更新 | 增加 C-40 门控与 sizing provenance 回归：center/left、固定/min/max、percentage/negative/zero/auto/unknown、float、fit/fullpage、不可读 CSSOM、reader default/custom CSS 与重排生命周期 | 定向 64/64；全量 Vitest 34 文件、314/314 | 是 |
| `docs/tasks/active/epub-guide-compatibility.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/MODULE_CONTRACTS.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-047/C-40 根因、C-04 边界、来源保守策略、B-024 对比、Chromium/全量验证与 Windows 待确认项 | `tsc --noEmit`、`pnpm build`（95 modules）通过；无 Rust 改动，临时脚本已清理 | 是 |

## B-048/C-41：链接书库 `cover.webp` 封面候选统一

| 文件 | 状态 | 变更摘要 | 验证 | 是否同步 |
|---|---|---|---|---|
| `src-tauri/src/linked_library.rs` | 更新 | Rust 原生链接导入保留有序 manifest，统一 EPUB3 `cover-image`、EPUB2 meta 和精确 `cover.*` href fallback；候选去 query/fragment、URL 解码/规范化、验证图片类型与 ZIP 条目存在，删除 `id.contains("cover")` 模糊匹配 | Rust 13/13、`rustfmt --check`、`cargo check --quiet` 通过；仅 `ZipArchive::by_name` 查询中央目录，不解压/解码/全 ZIP 扫描/额外哈希 | 是 |
| `src/core/book.ts`、`src/test/weirdBooks.test.ts` | 更新 | 浏览器预览使用同一候选顺序和有效性边界；manifest 资源路径去 query/fragment，新增失效标准声明继续回退 URL 编码 `Cover.WEBP` 的合成 EPUB 回归 | 新回归旧实现失败；全量 Vitest 34 文件、315/315，`tsc --noEmit`、`pnpm build`（95 modules）通过 | 是 |
| `docs/tasks/active/cover-fallback-contract.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/PROJECT_CONTEXT.md`、`docs/tasks/active/version-0.1.7-release-candidate.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-048/C-41：发行版差异来自 Rust 原生链接导入而非 WebView2/WebP 解码；低成本 O(manifest + 少量 by_name) 路径、旧库不迁移、重复导入刷新 binding 且保留进度 | 文档/契约核对；未启动 Chromium/Vite，Windows 发布包真实 `cover.webp` 导入待用户确认 | 是 |

## B-049：设置数值步进边界与阅读器重载

| 文件 | 状态 | 变更摘要 | 验证 | 是否同步 |
|---|---|---|---|---|
| `src/ui/settingsStepper.ts`、`src/ui/settingsStepper.test.ts` | 新增 | 纯数值有序步进按可见默认值处理 `undefined` 自动档；方向减/加分别取最近较小/较大值，超界 clamp；自动档若候选等于可见默认值则保持 `undefined` | 新回归旧实现 3 项失败；修复后设置步进 4/4 | 是 |
| `src/App.tsx` | 更新 | 行高、字重、字间距、字符间距改用纯数值档位；真实变化返回新 settings identity，边界 no-op 返回原对象；字号和 direct slider change 同步 clamp/避免无效更新，沿用 B-040 的 150ms reload debounce | 相关定向 7/7；全量 Vitest 35 文件、319/319；`tsc --noEmit`、`pnpm build`（96 modules） | 是 |
| `docs/tasks/active/settings-stepper-bounds.md`、`docs/tasks/active/README.md`、`docs/BUGFIX_LOG.md`、`docs/MODULE_CONTRACTS.md`、`docs/PROJECT_CONTEXT.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 登记 B-049 根因、自动档可见默认值、identity/reload no-op 契约和验证边界；rendering-layers 无变化 | 文档与实现术语核对；WSL Chromium 真实点击确认有效步进各新增一次 iframe load，行高上下界与字间距下界额外点击均保持值和 load 计数；Vite/Chromium 已停止，5173/5174 未监听 | 是 |

## 0.1.8 测试发布候选收口

| 文件 | 状态 | 变更摘要 | 验证 | 是否同步 |
|---|---|---|---|---|
| `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` | 更新 | 四处产品版本统一提升为 0.1.8；Cargo.lock 仅修改 `epub-reader` 根包，不改同版本依赖 | 四处版本一致；Cargo metadata 识别 `epub-reader@0.1.8`；Rust 13/13、fmt/check 通过 | 是 |
| `docs/RELEASE_0.1.8.md`、`docs/tasks/active/version-0.1.8-release-candidate.md`、`docs/PROJECT_CONTEXT.md`、`docs/HANDOFF.md`、`docs/tasks/active/README.md`、`docs/SOURCE_DELTA.md` | 新增/更新 | 建立 0.1.8 当前发布入口、WSL→Windows 备份式干净同步命令、排除项、构建产物路径和 WebView2 验收矩阵；0.1.7 文件保留为阶段历史 | 文档路径/命令核对；Vitest 35 文件 319/319、tsc、Vite build（96 modules）通过 | 是 |

## 推荐比较命令

仅用于只读核对，不执行复制：

```bash
diff -qr \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=target \
  --exclude=target2 \
  --exclude=gen \
  --exclude=.pnpm-store \
  --exclude=.pw-browsers \
  --exclude=.pw-libs \
  --exclude=.git \
  <PROJECT_ROOT>/eupb-read \
  <PROJECT_ROOT>/epub-reader
```

## 开源协议切换（2026-08-21）

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `LICENSE` | 替换 | 由 MIT License 切换为 **Apache License 2.0**（官方原文，202 行），用户选择以防潜在纠纷 | 与 apache.org 官方文本逐字比对 | 是 |
| `NOTICE` | 新增 | Apache 2.0 规范建议的 NOTICE 文件，声明 Copyright 2026 HeRenFor | 人工检查 | 是 |
| `README.md` | 更新 | 许可章节由 MIT 改为 Apache License 2.0 | 链接检查 | 是 |
