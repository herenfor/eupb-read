# 任务：目录 Contents 正对称 margin 回归

- 状态：待用户审核
- 创建日期：2026-08-18
- 最后更新：2026-08-18
- 对应 Bug：B-024

## 目标

恢复普通目录标题的作者水平缩进，使测试书 `Contents` 与 0.1.3 的位置一致，同时不撤销 C-18 的 fit/max-content 简介盒居中和 B-023 的百分比 margin 分页修复。

## 非目标

- 不按书名、`.ctt` 类名或 `Contents` 文本增加特判。
- 不改变书籍正文、目录条目结构或字体。
- 不重构分页器的其他 L5 补偿。

## 当前现象与证据

- 复现步骤：导入测试书，打开阅读器目录面板并跳到“目录”。
- 样本：`<PROJECT_ROOT>/测试用epub/【测试专用】[relea][zhs][玩具堂]侦探年与敏锐的山田学 包夹我的双胞胎擅自展开推理[01].epub`。
- 当前版旧实现：1280×800 时 `h3.ctt` 左缘 x=320、无 `data-reader-margin-fixed`，首个 `.toc` 左缘 x=348。
- 0.1.3 对照：同书、同 Chromium、同视口下标题左缘 x=344，inline margin 为 339px/291px；首个 `.toc` 仍为 x=348。
- 作者 CSS：`.ctt{font-size:2em;text-align:left;margin:1.3em .75em .5em}`，水平 `.75em` 在当前字号下为 24px。

## 已确认根因

C-18 为 `fit/max-content + margin:1em` 简介盒增加的正对称 margin 豁免没有限制 intrinsic-size 条件，普通 width:auto 标题也因左右 24px 相等而跳过 C-04，L3 auto margin 因而把标题放回版心左缘。

## 必须保持的行为

- 普通 width:auto 的显式对称 margin 继续走 C-04。
- fit/max-content 原始尺寸意图的正对称 margin 保持 reader auto 居中。
- 固定宽度的显式相等 margin 不冒充 auto；实际解析出的 auto 余量保持居中。
- B-023 外链 `margin-left:70%` 的目录保持一页。

## 预计修改文件

- `src/render/paginator.ts`：收窄 C-18 判断并提取 auto-like 几何判定。
- `src/render/paginator.test.ts`：新增决策边界回归。
- 渲染台账、Bug 记录、活动任务和源仓差异文档：记录原因、方案与验证。

## 实际修改

- 新增 `isAutoLikeHorizontalMargin()`，只有计算后的两侧余量等于真实居中剩余空间才识别为 auto-like。
- 新增 `shouldKeepSymmetricMarginsCentered()`，仅在元素保留 fit/max-content 原始意图时应用 C-18 正对称 margin 豁免。
- 普通 width:auto/固定宽度显式对称 margin 恢复 C-04 的版心内缩进写回。

## 验收标准

- [x] 1280×800 的 `Contents` 左缘恢复为 x=344，与 0.1.3 一致。
- [x] 900×650 的目录仍为 1/1 页，标题左缘为 x=154。
- [x] C-18 简介灰框在宽屏、窄屏和字号重排后仍逐列居中。
- [x] 固定宽度显式 margin 与实际 auto 余量有独立单测。
- [x] B-023 赤月目录仍为 1/1 页。
- [ ] Windows WebView2 发布包人工确认。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| `vitest run src/render/paginator.test.ts` | 14/14 通过；新增 2 项旧实现先失败 | 2026-08-18 |
| 全量 `vitest run` | 16 文件，179/179 通过 | 2026-08-18 |
| `tsc --noEmit` | 通过 | 2026-08-18 |
| Vite 生产构建 | 80 modules，构建通过 | 2026-08-18 |
| 0.1.3 快照 + 实书 Chromium 1280×800 | 标题 x=344、目录条 x=348、1/1 页 | 2026-08-18 |
| 当前修复 + 实书 Chromium 1280×800 | 与 0.1.3 几何一致：标题 x=344、margin 339px/291px、1/1 页 | 2026-08-18 |
| 当前修复 + 实书 Chromium 900×650 | 标题 x=154、margin 149px/101px、1/1 页 | 2026-08-18 |
| C-18 简介盒矩阵 | 1280×800、900×650、20px 字号下所有碎片逐列居中 | 2026-08-18 |
| B-023 赤月目录回归 | 1280×800 为 1/1 页，viewer `1270=scrollWidth`，目标 margin 889px/24px | 2026-08-18 |

## 不应同步的本地文件

- 本地测试 EPUB。
- `/tmp/repro-toyodo.mjs`、截图、0.1.3 的 `/tmp` 快照和浏览器输出。
- 既有 `scripts/repro-redmoon.mjs` 仍是本地实书复现脚本，不建议同步。
- `dist/`、`.pw-browsers/`、`.pw-libs/` 等构建与浏览器产物。

## 待完成与风险

- 等待用户在 Windows WebView2 发布环境确认视觉位置。
- 本轮只根据已有实书收窄 C-18；不猜测不存在的其他 intrinsic-sizing 类型。

## 交接说明

先读 B-024、C-18/C-24 和本文件。若 Windows 仍异常，优先记录 `h3.ctt` 的 computed width/margin、`data-reader-margin-fixed` 与左右几何，不要增加类名特判。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
