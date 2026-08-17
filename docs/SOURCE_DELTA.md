# 隔离副本相对源仓的变化

本文件是跨对话交接的首要状态页，用于回答：“`epub-reader` 相比真实源仓改了什么、是否验证、是否已经同步？”

## 路径映射

- 隔离副本：`/home/herenfor/test/epub-reader`
- 真实源仓：`/home/herenfor/test/eupb-read`
- 用户口头所称 `epub-read` 在当前磁盘上的实际名称为 `eupb-read`。
- AI 不得修改、提交或推送真实源仓。

## 比较基线

- 源仓提交：`4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`
- 提交时间：`2026-08-17T19:44:00+08:00`
- 提交说明：`feat: v0.1.5 - CSS compatibility and pagination stability release`
- 建档前结论：排除依赖、构建产物、浏览器和 Rust target 后，两边应用代码一致。

## 当前未同步变化

状态：**无。`0.1.5` 已同步至真实源仓并发布（提交 `4bb9c7b`，标签 `v0.1.5`，GitHub Release 已创建）。**

隔离副本与真实源仓（排除依赖、构建产物、浏览器与 Rust target 后）的应用代码、文档与版本元数据完全一致。

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
- `/home/herenfor/test/测试用epub/` 中的本地测试书
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

- **2026-08-17 `0.1.5` 发布同步**：提交 `4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`（`feat: v0.1.5 - CSS compatibility and pagination stability release`），标签 `v0.1.5` 已推送，GitHub Release 已创建。同步范围：版本元数据（0.1.5）、协作文档（AGENTS/CONTRIBUTING/PROJECT_CONTEXT/MODULE_CONTRACTS/SOURCE_DELTA/BUGFIX_LOG/RELEASE_0.1.5/tasks）、B-007 至 B-019 的渲染与交互修复及其测试、`docs/rendering-layers.md` 冲突台账、`docs/tasks/active/*` 任务记录。验证：158/158 测试通过、tsc 与 vite 构建通过、`git diff --check` 通过。

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
  /home/herenfor/test/eupb-read \
  /home/herenfor/test/epub-reader
```
