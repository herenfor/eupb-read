# 项目上下文与接手入口

本文件给没有历史聊天上下文的维护者或 AI 提供最小而稳定的项目认识。详细功能清单见根目录 `README.md`。

## 环境角色

- 隔离开发副本：`/home/herenfor/test/epub-reader`
- 真实 Git 源仓：`/home/herenfor/test/eupb-read`
- 本地测试书目录：`/home/herenfor/test/测试用epub`
- 当前主要平台：Windows；浏览器模式用于快速开发，Tauri 负责桌面交付。

AI 只能修改隔离副本。源仓同步、提交和 GitHub 推送由用户完成。

## 当前基线

- 当前开发阶段：`0.1.6`
- 已发布版本：`0.1.5`（已在 Windows 编译、打包并分发）
- 0.1.5 发布提交：`4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`
- 当前源仓比较基线：`e349ab50e1a98f893c8de07dcc84fcf86f95f77d`
- 基线提交说明：`docs: record v0.1.5 sync in SOURCE_DELTA, align TEMPLATE whitespace`
- 切换到 0.1.6 开发阶段前，隔离副本与源仓完全一致。
- 当前单元测试基线：15 个测试文件、170 个用例；Rust 书架兼容测试 2 个。
- 四处构建版本元数据仍为已发布的 `0.1.5`；准备 0.1.6 发布时再统一升版。
- 渲染规划：`docs/PRELOAD_PLAN.md` 的 P0 首帧显示门已实现；P1 相邻章预加载与 P2 动画仍只是后续预留，不要视为已实现。

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
- `src/ui/shelf.ts`：Tauri/IndexedDB 双存储接口。
- `src/ui/importBooks.ts`：内容指纹、旧条目懒判重、批量结果提示与一次性书架合并。
- `src/ui/progressWriter.ts`：同书最新值优先的串行进度写入与退出 flush。
- `src-tauri/src/lib.rs`：本地书籍、封面和 `shelf.json` 的文件命令。

## 修改前必须理解的事实

1. EPUB 文件高度不统一，容错是产品能力，不是附带补丁。
2. 书籍 CSS 应尽量保留；阅读器 CSS 按 L1–L5 分层，详见 `rendering-layers.md`。
3. CSS 多栏会出现 Chromium 特有测量问题，因此分页器存在二次 margin、fit-content 和 float 修正。
4. 字号、窗口和图片加载都会触发布局变化，阅读位置必须依赖内容锚点恢复。
5. 章节加载和重排是异步的，过期任务不得写回新章节状态。
6. blob 章节在首次测量、二阶段补偿、分页自愈与入口定位完成前保持 `visibility:hidden`；不能改成 `display:none`，否则无法离屏测量。
7. 隐藏 iframe 不接收鼠标命中，连续滚轮还可能把目标锁定在外层直到手势结束；外层阅读区在加载期把输入压缩成最后方向，display-ready 后则继续按 80px 阈值翻页。不能改回非 ready 直接丢弃、ready 后忽略外层事件或按加载期事件数排队。
8. 章节在 iframe 中渲染，但脚本、表单、嵌套 iframe 等危险能力会被移除并由 CSP 再限制。
9. Tauri 与浏览器开发模式使用不同存储后端，但对 UI 暴露同一 `ShelfStore` 语义。
10. 新导入以 EPUB 字节 SHA-256 识别精确重复；0.1.5 旧条目保持原 ID，仅在相同大小候选参与判重时懒补 `contentHash`。重复项不得覆盖文件或进度。
11. 进度写入是单通道最新值优先；返回书架和桌面窗口关闭前会 flush。首次打开的 `markOpened` 只能清除新书标记。
12. Windows 大型正文/封面必须走 Tauri raw body 或可信来源路径复制，禁止恢复 `Array.from(bytes)` 数字数组传输；原生批量拖放必须逐本读取。

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
- 当前版本总任务：`tasks/active/version-0.1.6-development.md`
