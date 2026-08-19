# 任务：末尾媒体浮动元素跨列拆分

- 状态：待用户审核
- 创建日期：2026-08-18
- 最后更新：2026-08-18
- 对应 Bug：B-030

## 目标

修复目标书 `contents.xhtml` 在窄视口中末尾 `.fr` 纯图片浮动装饰跨列拆分、造成错误第二页或不可达内容的问题。

## 非目标

- 不按书名、类名或正文文本特判。
- 不修改 EPUB 文件或 `title.xhtml` 的整页 wrapper；后者本轮仅作诊断，是否调整等待用户判断。
- 不改变普通文字浮动、非媒体浮动、正文图片顺序或已有 C-08/C-23 float 宽度补偿。

## 根因与证据

目标书在 900×650 下末尾 `.fr` 的首列内容 top 约 476px，`scrollHeight` 约 187px，未分片底部约 663px；viewer 内容底部（扣除 `padding-bottom`）约 529px，因而残余溢出约 134px。`getBoundingClientRect().bottom` 是跨列碎片 union，约 529px，不能单独用于判断未分片溢出。子图 `ctt` 的左缘还可能比 `.fr` 左 16px，必须纳入视觉边界和碰撞门控。

## 实际方案

`ChapterPaginator.measure()` 在 float 宽度收缩后、最终 extent 计算前调用 `applyTrailingFloatMarginFix()`。候选必须是 viewer 最后一个直接子元素，computed `float` 为 left/right、position 为 static/relative，并且递归子树只含空白/注释、包裹元素和媒体（img/svg/image/video/audio/canvas）。

补偿前保存 inline `margin-top` 值及 priority，按首个内容列碎片 top + 正的 `scrollHeight` 估算未分片底部，临时上移 `overflow + 1px` 并强制回流。只有候选自身已合为单列、候选及所有后代的非零视觉 rect 都在该列内容区内、底部不越过 content bottom、且不与此前顶层兄弟及其后代发生实质交叠时才保留；失败立即恢复。列坐标计算包含 `viewer.scrollLeft`。每轮 measure 和 dispose 都恢复临时写回，避免叠加。

## 验收记录

- [x] 目标书 900×650：`第 1/1 页`；`.fr` `margin-top:-134.647px`，右下两张子图均在当前列且不撞目录。
- [x] 目标书 1280×800：`第 1/1 页`；`.fr` `margin-top:0px`，未产生无谓补偿。
- [x] 目标书 640×480：状态为 `第 1/2 页`；末尾浮动元素仍被安全处理，剩余两列来自目录主体自身在窄视口的跨列布局，不是 `.fr` 溢出残片。
- [x] B-019 头像书、B-023 赤月、B-024 侦探少年 contents、Sumeragi 相邻实书回归均未出现分页异常，900×650 各为 `1/1`。
- [x] 分页器定向测试 23/23，覆盖递归媒体树、union bottom 与 scrollHeight 推算、后代越界/碰撞否决、scrollLeft 列坐标。
- [x] 全量 Vitest 17 文件、199/199；`tsc --noEmit`、Vite 生产构建通过。
- [ ] Windows WebView2 发布包人工确认。

## 修改文件

- `src/render/paginator.ts`
- `src/render/paginator.test.ts`
- `docs/BUGFIX_LOG.md`
- `docs/rendering-layers.md`
- `docs/MODULE_CONTRACTS.md`
- `docs/tasks/active/README.md`
- `docs/tasks/active/version-0.1.6-development.md`
- `docs/SOURCE_DELTA.md`
- `docs/PROJECT_CONTEXT.md`

## 不应同步的本地文件

- `/tmp/repro-b030.mjs`
- Vite/Chromium 输出、测试 EPUB、`dist/`、`.pw-browsers/`、`.pw-libs/`

## 交接说明

若 Windows 仍异常，记录候选自身及所有后代 visual rect、首列碎片 top、`scrollHeight`、viewer content bottom、`scrollLeft`、前序顶层兄弟视觉 rect 和事务回滚结果；不要增加书名或类名特判。`title.xhtml` whole-page wrapper 差异目前仅为诊断结果，未改动。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
