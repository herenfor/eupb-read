# 任务：目录顶层 float 逃逸 40rem 版心

- 状态：待用户审核
- 创建日期：2026-08-20
- 最后更新：2026-08-20
- 对应 Bug：B-034

## 目标

修复目录页 viewer 直接子、无作者水平 margin 的 `float:left/right` 在宽视口贴窗口边缘的问题，使其在不违背书籍明确布局意图时回到居中的 40rem 版心边缘。

## 非目标

- 不修改 title.xhtml whole-page wrapper 差异；该 DOM 包含块语义变化仍属诊断结果。
- 不修改 B-030 末尾媒体 float 的垂直补偿或 640px 自然第二页。
- 不按书名、`.fr` 类名或测试 EPUB 特判；不修改测试 EPUB。

## 当前现象与证据

- 目标书 `contents.xhtml` 末尾直接子 `.fr` 的 computed `float:right`、水平作者 margin 为 0、宽约 80px。
- 1280 viewer 中当前元素位于 x=1200..1280，900 viewer 中位于 x=820..900；应分别回到 40rem 版心右缘约 960、770。
- 640px 以下保持窄容器自然布局，不能为此制造额外分页。

## 已确认根因

L3 的 `.reader-top` auto margin 在 float 上不能提供预期的版心内缩；Chromium 将无作者 margin 的顶层 float 贴到全宽 viewer 的物理边缘。当前 `applyBookMargins` 只处理有意义作者 margin、百分比与 intrinsic-size 盒，缺少该类 float 的安全分支。

## 必须保持的行为

- 仅 viewer 直接 `reader-top`、computed `float:left/right`、非全页类候选可命中。
- 作者任一有意义水平 margin、computed 宽度超过 40rem、全页类或作者明确全宽/突破版心意图时跳过。
- 宽容器写入浮动侧 margin `max(0,(parentWidth-min(parentWidth,40rem))/2)`，另一侧为 0；窄容器写入 0/0。
- 写回通过既有 `marginFixes` 生命周期恢复 inline 值和 priority。

## 实际修改

- `src/render/paginator.ts`：新增纯决策门与作者全宽意图门控；在 `applyBookMargins` 的 fit/max-content 分支之后，以 L3/L4 分支写回浮动侧 margin。
- `src/render/paginator.test.ts`：覆盖 right/left、窄容器、作者 margin、全页/过宽/全宽意图跳过。

## 验收标准

- [x] 纯函数测试覆盖触发与保守跳过条件。
- [x] `applyBookMargins` 使用现有 marginFixes 恢复生命周期。
- [x] 真实 Chromium 目标书已复核 1280/900/640 视口。
- [x] 全量 Vitest、TypeScript、Vite build。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| WSL 原生 Node + `vitest run src/render/paginator.test.ts` | 28/28 通过 | 2026-08-20 |
| WSL 原生 Node + `tsc --noEmit` | 通过 | 2026-08-20 |
| WSL 原生 Node + `pnpm test` | 22 文件、226/226 通过 | 2026-08-20 |
| WSL 原生 Node + `pnpm build` | TypeScript 与 Vite 生产构建通过 | 2026-08-20 |
| 目标书 Chromium 1280/900/640 | 1280、900 均 1/1 且图片收回版心；640 保持自然 2 页且第 2 页图片未越界 | 2026-08-20 |
| 玩具堂/赤月/すめらぎ相邻实书 | 目录定位、70% margin、内联盒 resize 均无回归 | 2026-08-20 |
| Windows `pnpm` shim 定向测试 | 环境失败：`node` 不在 PATH，未作为代码失败 | 2026-08-20 |

## 不应同步的本地文件

- 目标私有测试 EPUB、Chromium 截图与诊断输出均不属于本任务修改。

## 待完成与风险

- 作者全宽意图识别为保守 CSSOM 门控，不替代完整 CSS parser；不可读样式表或无法判断的条件规则会跳过本次补偿，以避免覆盖未知作者意图。
- Windows WebView2 发布版仍需人工确认。

## 交接说明

代码、自动化和 WSL Chromium 实书验证已完成；下一步由用户审核，并在 Windows WebView2 发布版确认。私有书路径不写入同步测试。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
