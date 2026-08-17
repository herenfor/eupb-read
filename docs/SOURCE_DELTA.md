# 隔离副本相对源仓的变化

本文件是跨对话交接的首要状态页，用于回答：“`epub-reader` 相比真实源仓改了什么、是否验证、是否已经同步？”

## 路径映射

- 隔离副本：`<PROJECT_ROOT>/epub-reader`
- 真实源仓：`<PROJECT_ROOT>/eupb-read`
- 用户口头所称 `epub-read` 在当前磁盘上的实际名称为 `eupb-read`。
- AI 不得修改、提交或推送真实源仓。

## 比较基线

- 源仓提交：`e349ab50e1a98f893c8de07dcc84fcf86f95f77d`
- 提交时间：`2026-08-17T19:46:39+08:00`
- 提交说明：`docs: record v0.1.5 sync in SOURCE_DELTA, align TEMPLATE whitespace`
- 基线结论：切换到 0.1.6 开发阶段前，排除依赖、构建产物、浏览器和 Rust target 后，两边完全一致。

## 当前未同步变化

状态：**0.1.6 已完成 B-020/B-021 的隔离实现与本地验证，等待用户审核和 Windows 安装包复核；依赖和构建版本元数据未修改。**

| 路径 | 类型 | 变化与原因 | 验证 | 建议同步 |
|---|---|---|---|---|
| `src/App.tsx` | 更新 | 导入改成逐本指纹判重、结束后一次合并 UI；单本/批量重复提示；进度乐观更新、返回/隐藏/关闭前 flush，`markOpened` 不再覆盖整条进度 | Chromium 单本/批量/旧数据/跨刷新进度；170/170 测试；生产构建 | 是 |
| `src/ui/shelf.ts`、`src/ui/shelf.test.ts` | 更新 | `ShelfEntry` 兼容可选 `contentHash`，存储返回 saved/duplicate，旧条目可只补指纹；Tauri 使用 raw/path 暂存命令；增加进度与新书标记合并回归 | Vitest、TypeScript、真实 Chromium IndexedDB | 是 |
| `src/ui/importBooks.ts`、`src/ui/importBooks.test.ts` | 新增 | SHA-256、0.1.5 同大小候选懒判重、书名截断、重复结果格式和批量一次合并 | 8/8 定向；真实 Chromium 批量提示和改名重复 | 是 |
| `src/ui/progressWriter.ts`、`src/ui/progressWriter.test.ts` | 新增 | 同书最新待写值优先的单通道进度队列，flush 时失败重试 | 3/3 定向；真实 Chromium 第 5/11 页跨刷新恢复 | 是 |
| `src-tauri/src/lib.rs` | 更新 | 正文/封面 raw IPC 或来源路径复制，暂存后提交且索引只写一次；内容指纹复检；旧索引兼容；所有索引变更通过同一 Mutex | `cargo check`、Rust 2/2、`cargo fmt --check` | 是 |
| `src-tauri/capabilities/default.json` | 更新 | 授予主窗口 `core:window:allow-destroy`，使关闭事件可在等待最终进度落盘后主动销毁窗口 | Tauri 配置生成与 `cargo check` | 是 |
| `docs/PROJECT_CONTEXT.md`、`docs/MODULE_CONTRACTS.md` | 更新 | 记录 0.1.6 测试基线、导入/进度模块和新的重复、二进制、写入顺序稳定契约 | 人工对照实现 | 是 |
| `docs/RELEASE_0.1.5.md` | 更新 | 将发布候选说明结案为已发布记录，登记 Windows 构建和分发完成 | 对照用户确认与发布提交 | 是 |
| `docs/BUGFIX_LOG.md` | 更新 | 保留 B-007 至 B-019 归档链接维护；新增 B-020 Windows 导入放大与重复覆盖、B-021 进度写入生命周期选择记录 | 对照代码、基准和浏览器回归 | 是 |
| `docs/tasks/archive/` | 归档 | 0.1.5 的 9 个已发布任务移入归档，补齐审核/同步勾选和发布提交；新增归档说明 | 与 0.1.5 发布范围和提交核对 | 是 |
| `docs/tasks/active/README.md` | 更新 | 清除 0.1.5 待同步提示，指向 0.1.6 总任务和当前待审核 B-020/B-021 | 人工检查 | 是 |
| `docs/tasks/active/version-0.1.6-development.md` | 新增/更新 | 建立 0.1.6 开发阶段基线并登记本轮子任务和 170 项测试现状 | 对照项目现状 | 是 |
| `docs/tasks/active/import-performance-duplicates-and-progress.md` | 新增 | 记录 B-020/B-021 范围、根因、实现、验收、验证和 Windows 待确认项 | 对照实现与本地结果 | 是 |
| `docs/tasks/TEMPLATE.md` | 更新 | 状态枚举增加“已发布归档” | 人工检查 | 是 |
| `docs/SOURCE_DELTA.md` | 更新 | 基线推进至 `e349ab5`，记录本轮纯文档差异 | 与真实源仓只读比较 | 是 |
| `LICENSE` | 新增 | 添加 MIT License（Copyright 2026 HeRenFor），仓库准备公开 | 人工检查 | 是 |
| `README.md` | 更新 | 许可章节改为指向 `LICENSE`（MIT） | 链接检查 | 是 |
| `CONTRIBUTING.md`、`docs/*.md`、`docs/tasks/**` | 泛化 | 本地绝对路径 `/home/herenfor/test/...` 全部替换为 `<PROJECT_ROOT>` 占位符，公开仓库不暴露本机路径 | 全项目残留扫描 0 处 | 是 |
| `scripts/setup-pw-fonts.mjs` | 泛化 | 硬编码测试书目录改为 `import.meta.dirname` 推导 + `TEST_BOOKS_DIR` 环境变量覆盖 | `node --check` 通过 | 是 |
| `scripts/archive/*.ts`、`scripts/img-repro.ts` | 泛化 | 调试脚本中的本机绝对路径替换为 `<PROJECT_ROOT>` 占位符（归档脚本按需自行配置） | 全项目残留扫描 0 处 | 是 |

当前 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 Cargo 锁文件中的本项目版本仍为 `0.1.5`。准备 0.1.6 发布候选时再统一升版。

本轮验证：Vitest 15 个文件 170/170、`pnpm build`、Rust 2/2、`cargo fmt --check` 通过。真实 Chromium 已验证单本/批量重复提示、改名后的 0.1.5 旧书判重不掉进度，以及多页书第 5/11 页、第三章、55% 在返回和刷新后完整恢复。一次性 Playwright 脚本和浏览器数据位于 `/tmp`/本地运行环境，不属于同步内容。Windows WebView2/NSIS 尚未重新编译验证。

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

- **2026-08-17 `0.1.5` 发布同步**：提交 `4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`（`feat: v0.1.5 - CSS compatibility and pagination stability release`），标签 `v0.1.5` 已推送，GitHub Release 已创建。同步范围：版本元数据（0.1.5）、协作文档、B-007 至 B-019 的渲染与交互修复及其测试、渲染冲突台账和任务记录。验证：158/158 测试通过、tsc 与 vite 构建通过、`git diff --check` 通过；用户随后确认 Windows 编译、打包和分发完成。
- **2026-08-17 `0.1.5` 文档收尾**：提交 `e349ab50e1a98f893c8de07dcc84fcf86f95f77d`（`docs: record v0.1.5 sync in SOURCE_DELTA, align TEMPLATE whitespace`），作为 0.1.6 开发阶段的比较基线。

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
