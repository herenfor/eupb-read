# 项目上下文与接手入口

本文件给没有历史聊天上下文的维护者或 AI 提供最小而稳定的项目认识。详细功能清单见根目录 `README.md`。

## 环境角色

- 隔离开发副本：`<PROJECT_ROOT>/epub-reader`
- 真实 Git 源仓：`<PROJECT_ROOT>/eupb-read`
- 本地测试书目录：`<PROJECT_ROOT>/测试用epub`
- 当前主要平台：Windows；浏览器模式用于快速开发，Tauri 负责桌面交付。

AI 只能修改隔离副本。源仓同步、提交和 GitHub 推送由用户完成。

## 当前基线

- 当前隔离副本版本：`0.1.8` 测试发布候选，准备由用户同步到 Windows 主机编译分发。
- 已发布版本：`0.1.5`（已在 Windows 编译、打包并分发）
- 0.1.5 发布提交：`4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`
- 当前源仓比较基线：`e8aabcdeb03543402338aee00fb2e33d52e39841`（`v0.1.6`，`origin/main`）。
- 基线提交说明：`fix: use u64 for shelf timestamps (Tauri IPC rejects u128)`。
- 排除本地测试产物后，隔离副本代码与该源仓提交一致；当前文档收尾差异见 `SOURCE_DELTA.md`。
- 当前隔离副本单元测试基线：35 个测试文件、319 个用例；Rust 测试 13 个。
- `package.json`、Tauri 配置、Cargo 清单和 Cargo 锁文件中的本项目版本均为 `0.1.8`。
- 渲染规划：`docs/PRELOAD_PLAN.md` 的 P0 首帧显示门已实现；P1 相邻章预加载与 P2 动画仍只是后续预留，不要视为已实现。
- 当前待审 B-029：CSS 注释边界保护已接入 `cssRewrite`、sanitize 和 paginator；递归 `@import` 共享保护 context，且已完成 sanitize 外链 CSS 的 Chromium 端到端验证；普通测试书回归与 Windows WebView2 仍按发布流程确认，详见 `docs/tasks/active/css-comment-boundaries.md`。
- 当前待审 B-030：末尾递归媒体-only float 的跨列补偿已接入 paginator；使用首列碎片 top + `scrollHeight` 推算未分片底部，并对候选及后代视觉 rect 做列边界/碰撞事务门控，详见 `docs/tasks/active/trailing-media-float-overflow.md`。title.xhtml whole-page wrapper 仍仅为诊断，未修改。
- 当前待审 B-031：桌面书库已由复制正文改为链接源 EPUB；可同步记录、设备绑定和缩略图缓存分层，支持存档导入/导出、缺失源文件重新定位和视口门控缩略图。自动化完成，Windows 100+ 本发布包性能与原生文件流程仍待确认，详见 `docs/tasks/active/linked-library-refactor.md`。
- 当前待审 B-032：Tauri 桌面端已接入官方单实例插件并保证其最先注册；重复启动会显示、取消最小化并聚焦已有 `main` 窗口。Rust 自动化完成，Windows 普通/最小化重复启动仍待实机确认，详见 `docs/tasks/active/desktop-single-instance.md`。
- 当前待审 B-033：阅读跳转历史改为最多 3 条 back/forward 双栈；App 使用初始保存位置基线与 paginator display-ready/同章 settled 门控，首次及连续 fragment 跳转都不再漏记，anchor 优先于页码恢复，转场期间不写旧 ready 进度，实际页状态而非仅整数百分比触发保存，详见 `docs/tasks/active/reader-navigation-history-forward.md`。
- 当前待审 B-034：目录顶层无作者水平 margin 的 left/right float 在宽视口回到居中的 40rem 版心边缘；全页/全宽意图、作者 margin 和过宽盒保守跳过，640px 窄容器保持自然布局，详见 `docs/tasks/active/toc-top-float-containment.md`。
- 当前待审 B-035：多看图片脚注富 HTML 复制到宿主弹层后，定向隐藏 `.duokan-footnote-content` 生成的注释 marker 并清零左 padding；普通作者列表保持编号，详见 `docs/tasks/active/footnote-rich-content-marker.md`。
- 当前待审 B-048：桌面链接导入与浏览器预览已统一 `cover-image → meta cover → cover.*` 封面候选契约；发布版漏封面来自 Rust 原生 OPF 解析而非 WebView2/WebP 解码。候选仅查询已打开 ZIP 中央目录，不解压、不扫描整书；全量 Vitest 34/315、Rust 13/13、TypeScript/Vite 均通过，详见 `docs/tasks/active/cover-fallback-contract.md`。
- 当前待审 B-049：设置详细数值步进按可见默认值使用纯数值有序档位；最小/最大边界继续点击返回原 settings identity，不触发无效阅读器重载；全量 Vitest 35/319、TypeScript/Vite 与 WSL Chromium 真实点击/reload 计数均通过，详见 `docs/tasks/active/settings-stepper-bounds.md`。

当前未同步变化以 `docs/SOURCE_DELTA.md` 为准，不要仅根据本节判断。

## 运行时主链路

```text
EPUB bytes
  → ZIP/container.xml
  → OPF metadata + manifest + spine
  → EPUB 3 NAV / EPUB 2 NCX / spine fallback
  → Book + ResourceServer
  → sanitizeChapter
  → Blob iframe
  → ChapterPaginator 多栏测量
  → 页码、内容锚点与进度持久化
```

## 模块地图

- `src/core/book.ts`：加载总编排、资源清单、目录、字体混淆、DRM。
- `src/render/sanitize.ts`：危险内容移除、资源和 CSS 改写、阅读器样式注入。
- `src/render/displayGate.ts`：保持布局能力的 visibility 显示门、代次与超时恢复。
- `src/render/paginator.ts`：章节生命周期、测量、分页、锚点、输入和运行时布局补偿。
- `src/ui/ReaderView.tsx`：React 与分页器之间的适配层。
- `src/App.tsx`：书架、阅读会话、设置、进度和面板状态编排。
- `src/ui/shelf.ts`：Tauri 链接书库/IndexedDB 隔离预览的统一存储接口。
- `src/ui/importBooks.ts`：内容指纹、旧条目懒判重、批量结果提示与一次性书架合并。
- `src/ui/progressWriter.ts`：同书最新值优先的串行进度写入与退出 flush。
- `src/ui/libraryArchive.ts`、`libraryArchiveBridge.ts`：无设备路径的存档 schema、校验、合并与书架投影。
- `src/ui/thumbnail.ts`：近视口缩略图调度、尺寸/格式派生与 Blob 生命周期。
- `src-tauri/src/linked_library.rs`：链接书库索引、流式哈希、ZIP 元数据、源文件读取/重新关联和有界缩略图缓存。
- `src-tauri/src/lib.rs`：Tauri 插件初始化、命令注册和自定义字体命令；旧复制式书库命令不再注册。

自定义 CSS 由 `MenuPanel` 本地草稿承载，只有“保存并应用”才触发父级提交和章节重载；浅色安全 `body bgcolor` 作为同一 override style 的默认 `background-color`，用户 CSS 位于其后，深色/纸色忽略书籍颜色。多个 CSS 预设仍是 optional backlog，需要 presets schema、UI CRUD 和旧 `customCss` 迁移。

工具栏由 `Toolbar` 测量左右控件实际 layout 宽度并取最大值形成对称侧轨，中间使用 `minmax(0,1fr)`；宽屏可完整标题必须居中，720px 以下切回不对称 max-content 轨道并单行省略。按钮不可通过隐藏/裁切解决布局问题，UI scale 只作用于界面。

## 修改前必须理解的事实

1. EPUB 文件高度不统一，容错是产品能力，不是附带补丁。
2. 书籍 CSS 应尽量保留；阅读器 CSS 按 L1–L5 分层，详见 `rendering-layers.md`。
3. CSS 多栏会出现 Chromium 特有测量问题，因此分页器存在二次 margin、fit-content、float 和 computed-right 行内盒溢出修正；逻辑 `end` 暂不处理以避免 RTL 误伤。
4. 字号、窗口和图片加载都会触发布局变化，阅读位置必须依赖内容锚点恢复。
5. 章节加载和重排是异步的，过期任务不得写回新章节状态。
6. blob 章节在首次测量、二阶段补偿、分页自愈与入口定位完成前保持 `visibility:hidden`；不能改成 `display:none`，否则无法离屏测量。
7. 隐藏 iframe 不接收鼠标命中，连续滚轮还可能把目标锁定在外层直到手势结束；外层阅读区在加载期把输入压缩成最后方向，display-ready 后则继续按 80px 阈值翻页。不能改回非 ready 直接丢弃、ready 后忽略外层事件或按加载期事件数排队。
8. 有效书内目录、普通内部链接和存在目标的同章 fragment 跳转都应进入 back/forward 双栈，每栈最多 3 步；目录/书签 UI 入口先记录再执行纯跳转，Paginator 内部链接先发带 href 的 before 通知再路由，无效目标、外链和脚注不记录。ReaderView 转发给长生命周期 paginator 的回调必须使用 latest ref。
9. 章节在 iframe 中渲染，但脚本、表单、嵌套 iframe 等危险能力会被移除并由 CSP 再限制。
10. Tauri 与浏览器开发模式使用不同存储后端，但对 UI 暴露同一 `ShelfStore` 语义；浏览器 IndexedDB 仍会保存测试字节，不代表桌面持久化设计。
11. Tauri 新导入以 EPUB 完整字节 SHA-256 识别精确重复，正文留在用户原路径；同内容重命名/重新导入只更新本机绑定，不覆盖进度、书签和首次添加时间。
12. 可同步 `LibraryRecord` 不得出现绝对路径；设备 `DeviceBinding` 与最大 100 MiB 的缩略图缓存不得进入导出存档。源文件缺失或内容变化时保留记录并标记不可用，重新定位必须复核完整哈希。
13. 进度写入是单通道最新值优先；首次稳定值立即提交，后续更新合并，返回书架、隐藏和桌面窗口关闭前会 flush。首次打开的 `markOpened` 只能清除新书标记。
14. Windows 大型正文/封面 IPC 必须走 Tauri raw body；禁止恢复 `Array.from(bytes)` 数字数组。批量导入只把路径交给 Rust 流式处理，整批结束后一次更新书架。

## 高风险修改区域

- `src/render/paginator.ts`：布局时序和阅读位置高度耦合。
- `src/render/sanitize.ts` 与 `src/render/cssRewrite.ts`：规则可能影响所有 EPUB。
- `src/App.tsx`：包含大量跨界面状态与持久化副作用。
- `src/styles.css`：书架、阅读器和弹层共享，视觉改动容易互相影响。

修改这些区域时应优先增加最小复现和回归证据，而不是扩大改动范围。

## 文档导航

- 协作规范：`../CONTRIBUTING.md`
- 模块稳定契约：`MODULE_CONTRACTS.md`
- 隔离副本差异：`SOURCE_DELTA.md`
- Bug 选择记录：`BUGFIX_LOG.md`
- 渲染冲突台账：`rendering-layers.md`
- 开发与发布说明：`HANDOFF.md`
- 任务模板：`tasks/TEMPLATE.md`
- 当前版本收尾记录：`RELEASE_0.1.8.md` 与 `tasks/active/version-0.1.8-release-candidate.md`；Windows 安装包状态仍待用户确认。
