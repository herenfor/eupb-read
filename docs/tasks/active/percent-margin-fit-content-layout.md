# 任务：修复百分比 margin 与 fit-content 的二次偏移

- 状态：已完成，纳入 0.1.5 待同步
- 创建日期：2026-08-17
- 最后更新：2026-08-17
- 对应 Bug：B-012

## 目标

修复测试书标题页和简介页被分页器二阶段 margin 补偿推向右侧的问题，同时保持既有目录不对称缩进、普通版心和 fit-content/float 回归。

## 样本

`/home/herenfor/test/测试用epub/【测试专用】[七菜なな].男女之间存在纯友情吗？（不，不存在！）.03.epub`

## 已确认根因与证据

### 标题页

- 章节：`OEBPS/Text/title.xhtml`；
- 目标：`.title.center`，原始 inline `margin:0 0 0 35%`；
- 当前 Chromium：viewer 1280px，目标 width 640px、left 768px、right 1408px，margin-left 768px、margin-right -128px，页面 2 页；
- 根因：`applyBookMargins` 把作者已相对页面计算的 35% margin（448px）再次加到居中版心 base（320px）上；reader 40rem max-width 又把作者原本剩余宽度截为 640px，造成右溢出与多页。

### 简介页

- 章节：`OEBPS/Text/summary.xhtml`；
- 目标：`.summary { max-width:fit-content; margin:0.5em auto; padding:...; border:1px }`；
- 当前 Chromium：目标 border-box 464px，但算法记录 computed content width 446px；最终 left 807px、right 1271px，并写入 margin-left 807px；
- 根因：auto-like 判断使用 content-box width，却拿它与包含 padding/border 的布局 margin 比较，约 9px 误差使真正的 auto 居中被判为作者不对称 margin，随后再次追加 base。

## 必须保持的行为

- 不按书名、`.title` 或 `.summary` 类名特判；
- 百分比水平 margin 代表相对包含块的页面布局时，不得再叠加居中版心 base，也不得被默认 40rem 截断后溢出；
- auto margin 判断必须使用与浏览器 margin 布局一致的 border-box 宽度；
- `restoreBookMargins()` 必须完整恢复本轮写入，反复 reflow 不得累计；
- B-006/C-03/C-04 的目录交错和小幅 em 缩进保持；C-09 fit-content 补偿保持；
- 不修改真实源仓和测试 EPUB。

## 预计修改

- `src/render/paginator.ts`：修正 border-box 宽度和百分比 margin 分支；
- `src/render/paginator.test.ts` 或可测试的纯 helper：覆盖盒模型与百分比布局决策；
- 文档：B-012、C-16、SOURCE_DELTA。

## 实际修改

- `paginator.ts` 新增 border-box 宽度换算，auto margin 判断不再混用 content-box 和 border-box；
- 对作者 inline 水平百分比 margin 建立通用页面相对分支：按需解除 L3 默认 max-width，读取作者在包含块中的真实 margin/宽度，并原位写回，不叠加版心 base；
- margin 修复快照改为同时保存值与 `!important` 优先级，并可恢复临时 max-width，连续 reflow 不累计；
- `paginator.test.ts` 新增 3 项回归：盒模型、百分比 margin 决策、inline 属性/优先级恢复。

## 验收标准

- [x] 标题页不再右溢出，scrollWidth 1280px，章页数由异常 2 页恢复为 1 页；
- [x] 标题作者信息保持作者 35% 页面布局，left 448/right 1280，完整可见；
- [x] 简介盒在 viewer 水平居中，中心 x=640；
- [x] 字号连续放大两档后简介中心仍为 x=640、标题 left 仍为448，无累计漂移；
- [x] 全量测试、类型检查、真实 EPUB Chromium 通过。

## 本地验证

| 操作 | 当前结果 | 日期 |
|---|---|---|
| `/tmp/book03-layout-check.mjs` | 标题 left 768/right 1408/2页；简介 left 807/center 1039 | 2026-08-17 |
| 定向 Vitest | paginator 5 项 + sanitize 44 项，49/49 通过 | 2026-08-17 |
| 全量 Vitest | 11 文件、140/140 通过 | 2026-08-17 |
| `tsc --noEmit` | 通过 | 2026-08-17 |
| 修复后真实 Chromium | 标题 1 页、left448/right1280；简介 center640；放大两档重排后位置稳定 | 2026-08-17 |

## 不应同步的本地文件

- 测试 EPUB
- `/tmp/book03-layout-check.mjs` 与临时输出

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
