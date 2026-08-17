# 任务：fit-content 简介盒与对称 margin 布局

- 状态：已完成，纳入 0.1.5 待同步
- 创建日期：2026-08-17
- 最后更新：2026-08-17
- 对应 Bug：B-014

## 目标

让同一章节内多个 `max-width:fit-content` 页面级盒在多栏分页中使用稳定宽度并保持同轴居中，不因内容长度或跨列而分别漂移。

## 非目标

- 不修改测试 EPUB。
- 不按 `.summary`、章节名或书名添加 CSS 特判。
- 不改变作者明确的不对称 margin 缩进。

## 当前现象与证据

- 样本：`【测试专用】[final][こりんさん].班上的原偶像，总之就是举止可疑.02.epub` 的 `summary.xhtml`。
- 书的 `.summary` 声明 `max-width:fit-content`；后置的 `div.summary` 声明 `margin:1em`、`padding:1em`。
- Chromium 1280×800 修复前：三个盒左缘分别为 359、143、21px；第二盒明显偏左，第三盒跨两列。窗口 900×650 时后两盒分别跨列或位于第二列。
- 运行时 inline margin 分别被写成 `354/322`、`138/106`、`16/-16px`，证明不是作者静态 CSS 本身的位置。

## 已确认根因

- `measure()` 先执行 `applyBookMargins()`，后执行 `applyFitContentFix()`。margin 阶段记录的是 Chromium 多栏中异常的 fit-content 宽度；后续把盒宽收敛到 40rem，却没有按新宽度重算 margin。
- `applyBookMargins()` 把左右均为 16px 的正对称 margin 走入 `ml > 0` 单向分支，错误地把双侧留白解释成向右缩进。

## 必须保持的行为

- B-012 的 auto 居中、百分比 margin 与 border-box 判断继续有效。
- `margin-left:2em; margin-right:0` 等真正不对称缩进继续相对正文版心生效。
- fit-content 无水平 margin 的左对齐容器继续放在正文列左缘。
- 重排前完整恢复临时 inline 值，不累计漂移。

## 预计修改文件

- `src/render/paginator.ts`：稳定 fit-content 与 margin 两阶段顺序，并识别正对称 margin。
- `src/render/paginator.test.ts`：对称 margin 决策回归。
- `docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md`。

## 实际修改

- 把 `applyFitContentFix()` 调整到 `applyBookMargins()` 之前，使 margin 始终基于最终 border-box 宽度。
- 用本轮 fit-content 补偿元素集合保留原始收缩意图，既有“无水平 margin 时左对齐正文列”分支不丢失。
- 新增正对称水平 margin helper；正值且左右近似相等时保持 reader auto 居中，不再进入单向缩进写回。
- 登记 B-014、C-18 与源仓差异。

## 验收标准

- [x] 三个简介盒在每一列中水平中心一致。
- [x] 1280×800 与 900×650 重排后每个跨列碎片均在所属列内居中。
- [x] 字号变化后不累计漂移。
- [x] 单测、类型检查与真实 Chromium 验证通过。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| 修复前 Chromium 1280×800、900×650 | 复现三个盒位置分散及错误跨列 | 2026-08-17 |
| 定向 Vitest | `paginator.test.ts` + `sanitize.test.ts`，52/52 | 2026-08-17 |
| 全量 Vitest | 11 文件、143/143 | 2026-08-17 |
| TypeScript | `tsc --noEmit` 通过 | 2026-08-17 |
| Chromium 1280×800 | 所有简介盒/跨列碎片以 640px 宽在所属列居中，无 margin 写回 | 2026-08-17 |
| Chromium 900×650 | 重排后仍逐列同轴居中 | 2026-08-17 |
| Chromium 字号 16→20px | 盒宽 640→800px、页数 2→3，所有碎片仍居中 | 2026-08-17 |
| B-012 实书回归 | 标题百分比 margin、简介 auto 居中及两档字号重排均通过 | 2026-08-17 |

## 不应同步的本地文件

- 测试 EPUB、`/tmp/inspect-suspicious-summary.mjs`、`/tmp/suspicious-summary-layout.mjs`、截图与浏览器产物。

## 待完成与风险

- 当前完成。正对称负 margin 刻意不归入居中分支，以保留作者潜在出血意图。

## 交接说明

实现与验证已完成；后续不得把 symmetric 规则扩展到负 margin，除非有真实样本和独立评估。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
