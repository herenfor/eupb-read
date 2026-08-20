# 任务：0.1.7 测试发布候选

- 状态：阶段历史；后续发布收口已转入 [`version-0.1.8-release-candidate.md`](./version-0.1.8-release-candidate.md)
- 创建日期：2026-08-20
- 最后更新：2026-08-20
- 对应版本：0.1.7

## 基线与范围

- 真实源仓比较基线仍为 `e8aabcdeb03543402338aee00fb2e33d52e39841`（`v0.1.6`）。
- 隔离副本四处构建版本已统一为 `0.1.7`：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、Cargo.lock 根包。
- 本测试版包含 B-023～B-030 渲染/交互修复、B-031 链接书库重构、B-032 桌面单实例、B-033 三步前进/后退历史、B-034 顶层 float 版心兼容、B-035 图片脚注 marker 修复、B-041～B-047 EPUB/CSS 兼容修复，以及 B-048 链接导入 `cover.webp` fallback。
- 不纳入相邻章节预加载、动画、全文搜索、高亮和多个自定义 CSS 预设。

## 已完成的本地验证

- 前端 Vitest：34 个文件、315/315。
- TypeScript：`tsc --noEmit` 通过。
- Vite production build：通过。
- Rust：13/13、`rustfmt --check` 与 `cargo check --quiet` 通过；当前 WSL Rust 发行包未提供 `cargo fmt` 子命令。`cargo metadata --locked --no-deps` 的既有 0.1.7 结果不变。
- 各渲染任务的真实 Chromium 样本矩阵记录在对应 B-023～B-035 任务文件和 `BUGFIX_LOG.md`。

## Windows 同步策略

不要把 WSL 的 `node_modules`、浏览器、`dist` 或 Rust `target` 复制到 Windows。为避免旧源码残留，同时复用主机已安装的依赖：

1. 把旧 Windows 项目目录改名为带时间戳的备份。
2. 新建空的 `D:\杂物\eupb-reader`。
3. 将旧目录的 `node_modules` 移到新目录；同盘移动不重新复制依赖内容。
4. 用 `robocopy` 从 WSL 复制源码，排除平台相关依赖、构建产物和本地测试工具。
5. `pnpm install --frozen-lockfile` 复核依赖，再执行测试和 Tauri 打包。

完整命令见 `docs/RELEASE_0.1.7.md`。

## Windows 测试版验收

- [ ] Windows 上 `pnpm test`、`pnpm tauri build` 成功，安装包显示 0.1.7（WSL 前端/Rust 复验已通过）。
- [ ] 正常重复启动和最小化后重复启动均只保留一个实例，并恢复主窗口。
- [ ] 批量导入 100+ 本时 CPU、内存和完成耗时可接受；导入期间书架不逐本重刷。
- [ ] 桌面书库不复制 EPUB 正文；源文件移动后显示不可用，同哈希重新定位成功。
- [ ] 使用 `id` 不含 cover、href 为 `cover.webp` 的 EPUB 导入后显示封面；确认这是 Rust 链接导入 fallback，而非 WebView2 解码差异。
- [ ] 删除书架记录不删除源文件；导入/导出无路径存档后进度和书签正确。
- [ ] 首次目录跳转可后退，最多三步，前进按钮可恢复误触前位置。
- [ ] B-023～B-035 的重点测试书完成抽样，图片脚注不显示 `019/020`。
- [ ] 安装、覆盖安装、卸载和免安装 exe 完成冒烟测试。

## 同步状态

- [x] 隔离副本版本与文档已整理。
- [ ] 用户已复制到 Windows 主机。
- [ ] Windows 测试版已编译和分发。
- [ ] 用户已同步真实源仓并创建 `v0.1.7` 标签。
