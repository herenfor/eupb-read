# 任务：inline SVG 图片页与 hr 版心布局

- 状态：已发布，随 0.1.5 归档
- 创建日期：2026-08-17
- 最后更新：2026-08-17
- 对应 Bug：B-013

## 目标

让纯图片章节采用 `svg > image` 包装时也在单页可视区域内按比例完整显示，并确认制作信息页的顶层 `hr` 与正文版心保持同轴居中。

## 非目标

- 不修改测试 EPUB。
- 不把所有含 SVG 的正文页强制转为全页图。
- 不覆盖 SVG 的 `viewBox`、`preserveAspectRatio` 或内部图片尺寸。

## 当前现象与证据

- 样本：`【测试专用】（多看）面对摆出姐姐架子的初恋对象、我是绝对不会屈服的！.epub`。
- `title.xhtml` 只有一个 `div > svg > image`；现有纯图检测只统计 HTML `img`，未标记 `fullpage-image`。
- Chromium 1280×800 实测 SVG 高 908.6px、viewer 可用高 739px、`scrollHeight=948`，底部被裁切但状态仍为 1/1 页。
- 制作信息页的 `hr` content width 为 640px、双侧边框各 1px，实际 border-box 为 642px；当前 B-012 border-box 修复后左右坐标 319/961，已居中。

## 已确认根因

- SVG 图片页没有进入现有纯图片章节识别分支，普通顶层 div 因 L3 版心限制为 40rem，SVG 的固有纵横比生成了超过页面高度的盒子。
- `hr` 的历史偏移与 B-012 相同：若用 content-box 判断 auto margin，会把 1px 边框造成的差值误判为书籍不对称 margin；当前实现已通用修复，需要补显式回归。

## 必须保持的行为

- 文字页、多个图片的排版页和自带固定限宽的 HTML `img` 页不进入全页模式。
- 已有 `.illus`/普通 `img` 全页行为不回归。
- 书籍 SVG 的资源引用继续安全改写为 blob URL。

## 预计修改文件

- `src/render/sanitize.ts`：扩展纯图章节识别与全页 SVG 样式。
- `src/render/sanitize.test.ts`：新增 inline SVG 图片页回归。
- `src/render/paginator.test.ts`：显式记录 `hr` border-box 回归。
- 渲染、Bug 与源仓差异文档。

## 实际修改

- 扩展纯图片页识别：支持无文字、单个带 `viewBox` 且直接包含单个 `<image>` 的 inline SVG。
- 调整 fullpage CSS：高度只传递给 HTML 包装祖先；SVG 视口占满可用区并保持书的 `preserveAspectRatio`，不覆盖内部 `<image>` 尺寸。
- 新增 SVG 失败回归与 `hr` 1px 双边框的 border-box 回归；未为 `hr` 增加重复运行时代码。
- 登记 B-013、C-17 与源仓差异。

## 验收标准

- [x] SVG 图片完整落在 viewer 可视高度内，保持比例且为 1 页。
- [x] 制作信息页各 `hr` 与正文版心同轴居中，跨页后也一致。
- [x] 单测、类型检查和真实 Chromium 验证通过。
- [x] 重排后无尺寸累计漂移。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| 修复前 Chromium 测量 | SVG 908.6px > viewer 739px；`scrollHeight=948` | 2026-08-17 |
| 定向 Vitest | `sanitize.test.ts` + `paginator.test.ts`，51/51 | 2026-08-17 |
| 全量 Vitest | 11 文件、142/142 | 2026-08-17 |
| TypeScript | `tsc --noEmit` 通过 | 2026-08-17 |
| Chromium 1280×800 | 三个 SVG 章节均 1/1 页，`scrollHeight=clientHeight=739`；标题图完整显示为 678.2px 高 | 2026-08-17 |
| Chromium 900×650 重排 | SVG 图仍 1/1 页且完整显示；制作信息页各列 `hr` 同轴居中、无 margin 写回 | 2026-08-17 |

## 不应同步的本地文件

- 测试 EPUB、`/tmp/inspect-duokan.mjs`、`/tmp/duokan-layout-check.mjs`、截图与浏览器产物。

## 待完成与风险

- 当前完成。剩余边界：带 `<defs>` 或 `<g>` 包装的纯 SVG 图片页不会被自动升级为 fullpage，遇到真实样本后再扩展。

## 交接说明

实现与验证已完成。后续若扩展 SVG 结构，继续坚持内容结构触发，不要对书名或章节名写特判。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [x] 用户已审核
- [x] 用户已同步到真实源仓
- 源仓提交：`4bb9c7b2e50ef3a13f2cc8cd06d91c25486911b7`
