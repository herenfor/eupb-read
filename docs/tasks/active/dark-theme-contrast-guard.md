# 任务：深色主题章节对比度保守修正

- 状态：待用户审核
- 创建日期：2026-08-22
- 最后更新：2026-08-22
- 对应 Bug：B-053/C-42

## 目标

- 目标章节在深色主题下，仅对 computed 前景色接近主题前景、实际对比度不足且候选深色前景显著改善的元素写入普通优先级 inline color。
- 透明背景按祖先背景递归合成；背景容器即使无直接文本也可修正，以便子孙继承。
- 只在 iframe load 后、章节首次 `prepareChapterForDisplay`/measure 前运行一次，不参与翻页或后续 measure。

## 非目标

- 不按书名/class 特判，不覆盖作者明确不同颜色，不处理 background-image、未知颜色或 opacity 不可靠分支。
- 不修改 paginator 显示门顺序、CSS 渲染规则、Rust 或发布包。

## 已确认根因

- 目标章节的浅色 box 使用半透明白背景，继承深色主题前景 `rgb(212,212,212)` 后实际对比度不足；现有主题 CSS 只覆盖 body/通用主题色，未对该类 author box 做保守运行时判定。

## 实际修改

- 新增 `src/render/darkThemeContrast.ts`：解析 RGB/RGBA/hex、递归 alpha 合成背景、计算 WCAG 相对亮度/contrast，并通过可注入 style adapter 执行 marker 与 inline color 修正。按 html→body 单次 DFS 传递背景安全状态，每个元素只读取一次 computed style。
- `ChapterPaginator.onIframeLoad` 在显示门仍 hidden 时、首次 measure 前仅调用一次；文档销毁时 marker 随 iframe 自然销毁。
- 新增纯逻辑/DOM adapter 测试，覆盖颜色解析、alpha 合成、contrast 门、作者不同色、背景图、opacity 和继承遍历。
- 同步登记 `docs/rendering-layers.md` 的 C-42 渲染层契约。

## 验收标准

- [x] 只在 dark theme 且章节首次 iframe load 后执行。
- [x] 浅色模式、未知/背景图/opacity/作者不同色分支保守跳过。
- [x] 半透明背景容器与透明文本后代按有效背景判断并可修正。
- [x] marker 与 DOM 生命周期一致，不需要额外恢复/reflow。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| darkThemeContrast、paginator 定向 Vitest | 68/68 通过 | 2026-08-22 |
| 全量 Vitest | 38 文件、341/341 通过 | 2026-08-22 |
| `tsc --noEmit` | 通过 | 2026-08-22 |
| Vite production build | 100 modules，通过 | 2026-08-22 |

## WSL Chromium 实机验证

- 目标书 `[简][雨穴].诡屋.02` 资料⑤，在 1280×800 下验证通过：light 模式 body/box/p 的 computed color 均为 `rgb(26,26,26)`，box 背景为 `rgba(255,255,255,0.8)`；dark 模式 body 为 `rgb(212,212,212)`，box/p 均为 `rgb(26,26,26)`，box 背景仍为 `rgba(255,255,255,0.8)`。
- Vite 验证结束后已 Ctrl-C 释放 5173 端口；临时 `/tmp/repro-dark-dialog.mjs` 仅用于复现，不同步。

## 不应同步的本地文件

- `node_modules/`、`dist/`、Rust target、测试书、截图和浏览器产物。

## 待完成与风险

- Windows WebView2 对 computed rgba、半透明背景和 inline style 的实机结果仍需确认；未知背景/合成路径会保守不修。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
