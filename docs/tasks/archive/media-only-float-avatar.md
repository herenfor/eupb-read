# 任务：修复媒体专用 float 头像错位

- 状态：已发布，随 0.1.5 归档
- 创建日期：2026-08-17
- 最后更新：2026-08-17
- 对应 Bug：B-019

## 目标

正常的小头像 float 保持浏览器固有宽度，不再被 C-08 的文字收缩补偿撑宽；真实文字 float 的既有补偿保持不变。

## 非目标

- 不给 `.twitter-tweet` 增加 `break-inside:avoid`。
- 不修改测试 EPUB、作者的负 margin、padding 或评论盒 CSS。
- 不扩大为 `picture`、任意 inline 包裹或递归媒体识别。

## 当前现象与证据

- 复现步骤：打开样本第一话，检查任一 `.twitter-tweet` 的首个浮动子元素及头像到 `tomochan` 的距离。
- 样本：`/home/herenfor/test/测试用epub/【测试专用】[あさのハジメ].要是和只对我冷淡的友利同学说『我知道你有隐藏账号』的话会怎么样？.01.[美化版].epub`。
- 修复前诊断：阅读器写入 `width:82.2px`；头像容器原生 width 为 27.1875px；头像到用户名的横向空隙由 3.1875px 增至 58.1875px。

## 已确认根因

C-08 只用 computed width ≤48px 筛选文字 shrink-to-fit 异常，因而误命中正常的 24px 图片 float。随后 Canvas 把图片前后的源码缩进空白作为可见文本宽度累加并写回。

## 必须保持的行为

- 含可见文字、`span` 等其他行内容的窄 float 继续进入 C-08。
- 只有直接 `img/svg` 加格式化空白/注释的 float 才跳过。
- 评论盒分页、作者 margin 和书籍源文件不变。

## 预计修改文件

- `src/render/paginator.ts`：收紧 C-08 的适用范围。
- `src/render/paginator.test.ts`：媒体专用与非媒体边界回归。
- `docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md`：记录原因、规则和隔离副本差异。

## 实际修改

- 新增 `isMediaOnlyFloatContent()`，忽略非渲染节点和纯空白文本，只接受至少一个直接 `img/svg` 且没有其他有效内容。
- `applyFloatShrinkFix()` 在 Canvas 测量前跳过上述媒体专用 float。
- 新增 2 组、5 个边界断言：`img/svg + 空白` 命中；可见文字、`span`、空内容不命中。

## 验收标准

- [x] 实书头像容器不再出现阅读器写入的 width。
- [x] 头像到用户名只保留作者声明的 0.2em padding。
- [x] 含文字或其他元素的 float 不被新规则跳过。
- [x] 全量测试和类型检查通过。
- [x] 评论盒页数与拆分行为未改变。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| `vitest run src/render/paginator.test.ts`（修改前） | 2 项失败，证明旧实现没有媒体专用边界 | 2026-08-17 |
| `vitest run src/render/paginator.test.ts`（修改后） | 9/9 通过 | 2026-08-17 |
| `pnpm test` | 13 文件 158/158 通过 | 2026-08-17 |
| `tsc --noEmit` | 通过 | 2026-08-17 |
| WSL Chromium 1280×800 实书回归 | 14 个头像均为 27.1875px，无 inline width；用户名间距 3.1875px；仍为 18 页、4 个原有拆分 | 2026-08-17 |

## 不应同步的本地文件

- `/home/herenfor/test/测试用epub/` 下的测试书。
- `/tmp/twitter-layout-check.mjs`、`/tmp/twitter-baseline-issue.png`。
- `.pw-browsers/`、`.pw-libs/` 和测试、构建产物。

## 待完成与风险

- 用户视觉审核和 0.1.5 发布已完成；`picture` 或嵌套媒体结构仍不在本轮无样本扩展。

## 交接说明

先读 B-019、C-23 与本文件。若用户报告其他媒体包装结构，不要直接递归认定为媒体专用；先确认其中没有可见文字，再增失败回归。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [x] 用户已审核
- [x] 用户已同步到真实源仓
- 源仓提交：`4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`
