# 0.1.5 发布记录

- 状态：已发布、已在 Windows 编译打包并分发
- 版本：`0.1.5`
- 整理日期：2026-08-17
- 发布提交：`4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`
- 标签：`v0.1.5`
- 发布后文档收尾提交：`e349ab50e1a98f893c8de07dcc84fcf86f95f77d`
- 隔离副本：`/home/herenfor/test/epub-reader`
- 真实源仓：`/home/herenfor/test/eupb-read`

本文件现作为 0.1.5 的已发布记录保留。发布同步、GitHub Release、Windows 编译、打包和分发均已完成。

## 发布定位

`0.1.5` 是 EPUB 渲染兼容性和分页交互稳定性版本，不包含相邻章节预渲染、动画、搜索、书签或高亮等扩展功能。

用户可见变化：

- 修复 CSS 子组合器，以及 `:target`、`:enabled`、`:disabled`、`:checked` 等状态选择器相关表现。
- 修复顶层块链接贴左、百分比 margin 导致限宽/分页异常、多个 `fit-content` 盒错位。
- 兼容多看 `svg > image` 全页彩图，并修复根页面滚动条、目录虚线与文字跨栏分离。
- 章节完成字体、布局补偿和最终定位前保持隐藏，避免盒子首次显示时横向闪动。
- 持续滚轮跨章后继续快进，不再停在第 2 页或倒数第 2 页。
- 修复小头像 float 被文字宽度补偿错误撑宽。

## 版本号

以下四处必须保持 `0.1.5`：

| 文件 | 字段 |
|---|---|
| `package.json` | `version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `[package].version` |
| `src-tauri/Cargo.lock` | `name = "epub-reader"` 对应 package 的 `version` |

`pnpm-lock.yaml` 当前格式不记录根项目版本，不需要为本次发布改动。源码中旧的“书架（0.1.4）”阶段标题已改为无版本的“书架”，避免以后与应用版本混淆。

## 实际同步范围（历史记录）

以下均为 0.1.5 实际同步范围，路径相对 `/home/herenfor/test/epub-reader`。

### 发布元数据与入口文档

- `package.json`
- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `docs/HANDOFF.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/MODULE_CONTRACTS.md`
- `docs/PRELOAD_PLAN.md`
- `docs/SOURCE_DELTA.md`
- `docs/BUGFIX_LOG.md`
- `docs/rendering-layers.md`
- `docs/RELEASE_0.1.5.md`
- `docs/tasks/`

### 前端代码与回归测试

- `src/App.tsx`
- `src/styles.css`
- `src/render/sanitize.ts`
- `src/render/sanitize.test.ts`
- `src/render/displayGate.ts`
- `src/render/displayGate.test.ts`
- `src/render/paginator.ts`
- `src/render/paginator.test.ts`
- `src/ui/ReaderView.tsx`
- `src/ui/turnIntent.ts`
- `src/ui/turnIntent.test.ts`

### Tauri 元数据与注释整理

- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/lib.rs`

`.gitignore` 在隔离副本与真实源仓已经一致，不需要重复复制。

## 严禁同步

- `node_modules/`、`dist/`、`.pnpm-store/`
- `.pw-browsers/`、`.pw-libs/`
- `src-tauri/target/`、`src-tauri/target2/`、`src-tauri/gen/`
- `targettmp/`、`.img-repro.png`
- `/home/herenfor/test/测试用epub/` 中的私有测试书
- `/tmp` 中的脚本、截图与日志

## 验证状态

| 验证 | 隔离副本结果 |
|---|---|
| Vitest 全量测试（`pnpm test` 对应执行内容） | 13 个文件，158/158 通过 |
| TypeScript + Vite 生产构建（`pnpm build` 对应执行内容） | 类型检查通过；77 个模块完成生产构建 |
| 版本一致性脚本 | `package/tauri/cargo/lock` 均为 `0.1.5` |
| `cargo metadata --locked --no-deps` | 通过，识别 `epub-reader@0.1.5` |
| Markdown 本地链接检查 | 22 个文档全部通过 |
| Windows 编译、Tauri 打包与分发 | 用户确认完成 |

各 Bug 的失败回归、真实 EPUB/Chromium 数据和剩余风险见 `docs/BUGFIX_LOG.md` 与对应 `docs/tasks/archive/*.md`。

本隔离环境最终验证直接调用本地 Vitest、TypeScript 和 Vite，执行内容与 `test`/`build` 脚本一致；随后用户已在 Windows 原生环境完成正式构建和分发。

## 已完成的发布流程

0.1.5 发布时按以下顺序完成检查：

1. `git status --short`：确认只有计划同步范围内的变化。
2. `git diff --check`：确认没有空白错误或冲突标记。
3. 核对四处版本号均为 `0.1.5`，并确认 `Cargo.lock` 没有误改第三方包版本。
4. `pnpm test` 与 `pnpm build`。
5. Windows 原生执行 `pnpm tauri build`；至少冒烟验证导入书籍、打开章节、翻页、返回书架和重启恢复。
6. 用户审核后完成提交、打 `v0.1.5` 标签并创建 GitHub Release。
7. 同步成功后更新 `docs/SOURCE_DELTA.md`，记录新提交哈希和同步历史。

不要把“同步到真实源仓”“提交”“推送”“打标签”合并成未经用户审核的一步。

## GitHub Release 文案（已发布）

### EPUB Reader 0.1.5

本版本集中改善不同来源 EPUB 的 CSS 兼容性、分页稳定性与连续翻页体验。

主要修复：

- 改善组合器和表单/目标状态选择器兼容性。
- 修复多种百分比 margin、fit-content、SVG 全页图、目录边框与根滚动布局异常。
- 在章节布局稳定后再显示内容，减少首次进入时的横向闪动。
- 修复持续滚轮跨章后停止快进的问题。
- 修复小型浮动头像被错误撑宽的问题。

说明：本版本仍使用 CSS multi-column 分页；相邻章节预渲染和翻页动画尚未实现。

## 已知非阻塞项

- 评论卡片若书籍自身没有 `break-inside:avoid`，仍可能被 CSS 多栏拆分；阅读器不会猜测所有带边框容器都应保持原子性。
- P1 相邻章预加载和 P2 动画仍为预留方案。
- 项目尚未选择开源许可证；若仓库准备公开开源，应由用户另行决定并添加 `LICENSE`，本次不擅自选择。
