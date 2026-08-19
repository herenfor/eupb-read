# 任务：目录 right 对齐行内色块尾随空白越界

- 状态：待用户审核
- 创建日期：2026-08-18
- 最后更新：2026-08-18（恢复标记、方向门控与测量性能修正）
- 对应 Bug：B-025

## 目标

修复目标书 `TOC.xhtml` 中可见行内色块被尾随 U+3000/NBSP 推过父段落 inline-end 的问题，同时让窄视口的末尾目录项保持可达。

## 非目标

- 不按书名、`.ctit`、`.tbox` 或正文文本特判。
- 不清除作者的右对齐、背景、边框、padding 或手工空白。
- 不改变普通行内链接、ruby、脚注和无视觉盒文本。
- 不调整 C-04/C-18 顶层 margin 规则。

## 根因与证据

样本 `【测试专用】[すめらぎひよこ].世界啊臣服于吾之火焰.01.试着把魔王城点了.epub` 的 `TOC.xhtml` 使用右对齐 `.ctit`，其 `.tbox/.tbox1` 是带背景与 padding 的 inline 盒，文本尾部含全角空格。1280×800 时父段落右缘为 960px，子盒右缘达到 997/1013/1077/1125/1141/1205px；仅将父 p 的 `text-indent` 设为 0 无效。900×650 时残余几何形成下一列，末尾“后记”曾出现状态与实际可达性不一致。

## 实际方案

`ChapterPaginator.measure()` 的顺序为：恢复上一轮行内盒、margin、fit-content、float 写回 → 稳定字体/回流 → fit-content → C-04/C-16 margin → float → C-25 行内盒几何补偿 → recompute。

`applyInlineBoxOverflowFix()` 只接受：

1. computed `display:inline`；
2. 尾部含至少一个 U+3000/NBSP，允许其后混合普通空格；
3. 存在非透明背景、边框或水平 padding；
4. 最近块包含容器的 computed `text-align` 为物理 `right`；逻辑 `end` 暂不命中，避免 RTL 下把左端误当右端；
5. 原始 rect 确实超过包含块 inline-end。

通过门控后临时写入 `display:inline-block!important` 与 `text-indent:0!important`，强制回流并再次验证右缘回到包含块内、宽度不超过包含块；否则事务式恢复。成功写回保存原始 inline 值与 priority，下一次 measure 或销毁时恢复。元素自身为链接/ruby/脚注语义节点，或处于 ruby/sup/脚注祖先内时跳过。

## 验收记录

- [x] 1280×800：目标书所有越界色块右缘回到 960px，宽 249px，目录 1/1。
- [x] 900×650：当前列色块右缘回到 770px；状态为 1/2；键盘下一页到达 2/2；最后“后记”位于第 2 列且已原子化。
- [x] B-023 赤月百分比 margin 目录仍 1/1，margin 889/24px。
- [x] B-024 侦探少年 Contents 左缘 344px，目录 1/1。
- [x] 分页器定向测试 19/19。
- [x] 全量 Vitest 16 文件 184/184。
- [x] reflow/销毁恢复会移除 `data-reader-inline-box-fixed`，下一轮可重新评估；遍历节点先检查尾随补齐空白再读取 computed style。
- [x] TypeScript 检查、Vite build。
- [ ] Windows WebView2 发布包人工确认。

## 修改文件

- `src/render/paginator.ts`
- `src/render/paginator.test.ts`
- `docs/BUGFIX_LOG.md`
- `docs/rendering-layers.md`
- `docs/tasks/active/README.md`
- `docs/SOURCE_DELTA.md`
- `docs/PROJECT_CONTEXT.md`

## 不应同步的本地文件

- `scripts/repro-sumeragi.mjs`
- `scripts/check-sumeragi.mjs`
- `/tmp/sumeragi-*.log`、截图与一次性 Playwright 输出
- 测试 EPUB、`dist/`、`.pw-browsers/`、`.pw-libs/`

## 交接说明

若 Windows 仍异常，优先记录候选 inline 元素的 computed display、尾部码点、背景/边框/padding、最近块 text-align、before/after rect 和 `data-reader-inline-box-fixed`，不要增加书名或类名特判。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
