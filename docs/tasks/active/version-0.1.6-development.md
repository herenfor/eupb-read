# 任务：0.1.6 开发阶段

- 状态：已同步，待 Windows 发布状态确认
- 创建日期：2026-08-17
- 最后更新：2026-08-20
- 对应 Bug：无（版本总任务）

> 本文件保留 0.1.6 开发与源仓基线历史。当前测试发布候选已转入 [`version-0.1.7-release-candidate.md`](./version-0.1.7-release-candidate.md)，不要继续把新的发布状态写入本文件。

## 目标

作为 0.1.6 开发阶段的总入口，记录版本基线、范围边界和后续任务索引；具体功能或 Bug 仍使用独立任务文件。

## 当前基线

- 已发布版本：`0.1.5`
- 0.1.5 发布提交：`4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`
- 0.1.5 文档收尾/本阶段起始基线：`e349ab50e1a98f893c8de07dcc84fcf86f95f77d`
- 0.1.5 已由用户在 Windows 主机编译、打包并分发。
- 0.1.6 当前源仓基线：`e8aabcdeb03543402338aee00fb2e33d52e39841`，已推送 `origin/main` 并打标签 `v0.1.6`。
- 当前隔离副本单元测试：23 个测试文件、228 个用例；Rust 测试 10 个。
- 四处构建版本元数据均已升至 `0.1.6`。

## 非目标

- 本次文档切换不修改应用代码、依赖或四处构建版本号。
- 不自动把 P1 相邻章节预加载、P2 动画、搜索、书签或高亮纳入 0.1.6。
- 不预先创建没有用户需求或复现证据的实现任务。

## 当前范围

- [导入性能、重复识别与阅读进度可靠性](./import-performance-duplicates-and-progress.md)：已同步；B-020/B-021 已通过本地验证，Windows 安装包性能与关闭事件待最终确认。
- [书架全选、用户自定义字体与自定义 CSS](./custom-fonts-css-and-select-all.md)：已同步并通过前端/Rust 本地验证；Windows 打包待最终确认。
- [阅读跳转历史返回](./reader-history-back.md)：已实现、验证并同步。
- [书签功能](./bookmark-feature.md)：已同步并通过前端/Rust 本地验证；Windows 打包待最终确认。
- B-022 百分比 margin 分页修复、封面回退、公开仓库路径泛化和 MIT License 已随 0.1.6 同步。
- 最后提交把 Tauri IPC 不支持的 `u128` 时间参数改为 `u64`；后续不得恢复为 `u128`。
- B-027 自定义 CSS 显式保存与浅色 `body bgcolor` 级联修复已在隔离副本完成，待用户审核/同步；多个 CSS 预设仍为 optional backlog，需要 presets schema、UI CRUD 与旧 `customCss` 迁移设计。
- B-028 工具栏窄窗口布局已在隔离副本完成，待用户审核/同步；仅修改 `Toolbar` 适配与 UI toolbar CSS，未改变正文/EPUB CSS。
- B-029 CSS 注释边界保护已在隔离副本完成，并完成 Chromium 外链 CSS 端到端验证；注释内资源与声明不会参与改写，多个递归 `@import` 仍共享保护上下文。普通测试书回归与 Windows WebView2 确认仍按发布流程进行。
- B-030 末尾媒体 float 跨列修复已在隔离副本完成；目标书 900×650 为 1/1、1280×800 为 1/1 且宽屏不写补偿，640×480 的剩余两列来自目录主体自身；B-019、B-023、B-024、Sumeragi 实书回归通过。title.xhtml whole-page wrapper 仅诊断未修，等待用户判断。
- B-031 链接书库重构已在隔离副本完成自动化验收：桌面不再复制 EPUB 正文，记录/本机绑定/缩略图分层，支持无路径存档、源文件缺失重新定位、视口门控封面和最新进度 flush。Windows 发布包的 100+ 本性能与原生文件流程待确认，详见 `linked-library-refactor.md`。
- B-032 桌面单实例已在隔离副本完成 Rust 自动化：官方插件最先注册，重复启动恢复并聚焦已有主窗口；Windows 普通/最小化双启动仍待实机确认，详见 `desktop-single-instance.md`。
- B-033 阅读跳转历史前进/后退已在隔离副本完成：back/forward 各最多 3 条，display-ready 门控稳定恢复，首次跳转 ready 竞态与 anchor 覆盖旧页码问题已修复；待用户审核，详见 `reader-navigation-history-forward.md`。
- B-034 目录顶层 float 版心逃逸已在隔离副本完成：仅对无作者水平 margin、宽度不超过 40rem 的直接 `reader-top` float 写入物理侧版心 inset；全页/全宽意图和过宽盒跳过，待用户审核，详见 `toc-top-float-containment.md`。
- B-035 图片脚注弹层序号泄漏已在隔离副本完成：仅对多看 `.duokan-footnote-content` 隐藏宿主生成 marker、清零 padding 并取消图片负缩进，普通列表保持编号，待用户审核，详见 `footnote-rich-content-marker.md`。

## 工作规则

1. 每个非平凡功能或 Bug 使用独立 `docs/tasks/active/*.md`。
2. Bug 继续使用 `docs/BUGFIX_LOG.md` 的连续编号；渲染兼容规则继续登记到 `docs/rendering-layers.md`。
3. 每次可同步修改都更新 `docs/SOURCE_DELTA.md`。
4. 0.1.6 已完成版本号同步和 Git 标签；Windows 安装包确认后，本文件和全部子任务再移入 `docs/tasks/archive/`。
5. 下一开发版本由用户明确指定，不因继续修 Bug 自动推断版本号。

## 验收标准

- [x] 0.1.5 发布状态和真实源仓基线已记录。
- [x] 0.1.5 任务已归档。
- [x] 0.1.6 开发阶段与发布候选阶段明确区分。
- [x] 0.1.6 功能/Bug 范围已逐项形成并同步。
- [x] 四处版本元数据、真实源仓提交和 `v0.1.6` 标签一致。
- [x] 交接时重新完成全量测试、生产构建、Rust 检查和版本一致性检查。
- [ ] 补齐 Windows 打包与运行确认记录。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [x] 用户已同步到真实源仓
- 源仓提交：`e8aabcdeb03543402338aee00fb2e33d52e39841`（`v0.1.6`）
