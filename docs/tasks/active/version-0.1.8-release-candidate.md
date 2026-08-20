# 任务：0.1.8 测试发布候选

- 状态：隔离副本已完成收口，待 Windows 编译分发与实机验收
- 创建日期：2026-08-21
- 最后更新：2026-08-21
- 对应版本：0.1.8

## 基线与范围

- 真实源仓比较基线仍为 `e8aabcdeb03543402338aee00fb2e33d52e39841`（`v0.1.6`）。
- 隔离副本四处构建版本统一为 `0.1.8`：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、Cargo.lock 根包。
- 本测试版承接 0.1.7 候选的 B-023～B-040，并加入 B-041～B-047 EPUB/CSS 兼容修复、B-048 桌面 `cover.webp` fallback 与 B-049 设置步进边界/有效重载修复。
- Windows/WebView2 的特定字体合成空心化已完成诊断；用户 CSS 以 `font-weight:400` 和 `font-synthesis:none` 可规避，但本轮没有加入会改写书籍字体设计的全局生产规则。
- 不纳入相邻章节预加载、动画、全文搜索、高亮和多个自定义 CSS 预设。

## 已完成的本地验证

- 收口前前端 Vitest：35 个文件、319/319。
- TypeScript：`tsc --noEmit` 通过。
- Vite production build：通过。
- Rust：13/13，格式检查与 `cargo check` 通过。
- WSL Chromium：B-049 有效步进会触发一次 debounce 后章节重载；最大/最小边界继续点击保持值和 load 次数不变。
- 版本提升后复验：Vitest 35 文件 319/319、`tsc --noEmit`、Vite production build（96 modules）、`cargo fmt --check`、Rust 13/13、`cargo check --locked` 均通过；`cargo metadata --locked --no-deps` 识别 `epub-reader@0.1.8`。

## Windows 同步策略

不把 WSL 的 `node_modules`、浏览器、`dist` 或 Rust `target` 复制到 Windows。为避免旧源码残留，同时复用主机已安装的依赖：

1. 把旧 Windows 项目目录改名为带时间戳的备份。
2. 新建空的 `D:\杂物\eupb-reader`。
3. 将旧目录的 `node_modules` 移到新目录；同盘移动不重新复制依赖内容。
4. 用 `robocopy` 从 WSL 复制源码，并排除平台依赖、构建产物和本地测试工具。
5. `pnpm install --frozen-lockfile` 复核依赖，再执行测试和 Tauri 打包。

完整命令见 `docs/RELEASE_0.1.8.md`。

## Windows 测试版验收

- [ ] Windows 上 `pnpm test`、`pnpm tauri build` 成功，安装包显示 0.1.8。
- [ ] 正常重复启动和最小化后重复启动均只保留一个实例，并恢复主窗口。
- [ ] 批量导入 100+ 本时 CPU、内存和完成耗时可接受；导入期间书架不逐本重刷。
- [ ] 桌面书库不复制 EPUB 正文；源文件移动后显示不可用，同哈希重新定位成功。
- [ ] 使用 `id` 不含 cover、href 为 `cover.webp` 的 EPUB 导入后显示封面。
- [ ] 删除书架记录不删除源文件；导入/导出无路径存档后进度和书签正确。
- [ ] 首次目录跳转可后退，最多三步，前进按钮可恢复误触前位置。
- [ ] 详细设置有效 +/- 会刷新阅读器；到达上下界后继续点击不改值、不回默认点。
- [ ] B-041～B-047 的目标书在 WebView2 抽样无新增分页、float、margin 或脚注回归。
- [ ] 安装、覆盖安装、卸载和免安装 exe 完成冒烟测试。

## 同步状态

- [x] 隔离副本版本与发布文档已整理。
- [ ] 用户已复制到 Windows 主机。
- [ ] Windows 测试版已编译和分发。
- [ ] 用户已同步真实源仓并创建 `v0.1.8` 标签。
