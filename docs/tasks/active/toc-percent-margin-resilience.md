# 任务：目录页百分比 margin 分页兼容复修

- 状态：待用户审核
- 创建日期：2026-08-18
- 最后更新：2026-08-18
- 对应 Bug：B-023（B-022 记录为部分修复）

## 目标

让《试着向准备跳下去的同班同学提议「和我XX吧！」02》的目录页在 Chromium/WebView 环境中保持一页；作者 `margin-left:70%; margin-right:1.5em` 必须以包含块坐标布局，不能再被阅读器版心偏移叠加而越列。

## 非目标

- 不按书名、章节名、类名或具体百分比建立特判。
- 不改动 EPUB 测试书、真实源仓、分页架构或其他 C-16/C-18 行为。
- 不实现预渲染或新的通用 CSS 重写规则。

## 当前现象与证据

- 样本：`<PROJECT_ROOT>/测试用epub/【测试专用】[赤月ヤモリ].试着向准备跳下去的同班同学提议「和我XX吧！」.02.epub`。
- 用户环境仍会将目录页展开为两页；旧 B-022 的 CSSOM 扫描在当前 WSL Chromium 中偶然可得到 1/1，不能证明跨引擎/时序稳定。
- 作者规则为 `.ri.ti20er{margin-left:70%;margin-right:1.5em}`；`getComputedStyle()` 会把百分比解析为 px，CSS Typed OM 在临时解除阅读器 auto margin 后仍可保留 `70%` 指定值。

## 已确认根因

旧 B-022 用样式表规则扫描推测百分比来源，未以“临时禁用阅读器 `reader-top` auto margin 后最终获胜的级联值”为准；不可读外链样式表还可能在 `cssRules` 访问处抛出，导致扫描中断。因而该判断在不同 WebView、样式表加载状态或级联结构下不稳定。

## 必须保持的行为

- C-04 对普通 `2em` 等小幅不对称缩进的版心补偿继续有效。
- C-16 的 inline 百分比、`calc(...%...)`、auto 居中、fit-content 和 inline 优先级恢复继续有效。
- 作者原位也已越出包含块的布局不能被几何兜底错误改写为“安全布局”。
- 不可读外链样式表不得阻断整章测量。

## 预计修改文件

- `src/render/paginator.ts`：用 CSS Typed OM 的最终级联判定替代主路径的 CSSOM 猜测；保留安全回退并增加越列几何兜底。
- `src/render/paginator.test.ts`：覆盖 Typed OM 的百分比/calc、普通缩进、真实越列和原位越列边界。
- `docs/BUGFIX_LOG.md`、`docs/rendering-layers.md`、`docs/SOURCE_DELTA.md`：待代码审查和实书验证后记录最终事实。

## 实际修改

- `src/render/paginator.ts`：百分比主判定改为先临时移除 `reader-top` auto margin，再从 CSS Typed OM 读取最终获胜的水平 longhand；`%` 与 `calc(...%...)` 均进入 C-16 原位分支。
- `src/render/paginator.ts`：CSSOM 仅作为 Typed OM 不可用时的兼容回退；逐张 stylesheet 捕获 `cssRules` 读取错误，存在不可读表时不把“未找到”当作 false。
- `src/render/paginator.ts`：新增严格的未知来源几何兜底。只有原位留有余量、叠加 C-04 base 后越列、且不是 auto-like 余量时才写回原位。
- `src/render/paginator.test.ts`：新增 Typed OM 百分比/`calc`、不可读样式表、普通 2em、赤月 70%、原位越列、非对称 `right:auto` 和 auto 居中余量回归。
- 文档：B-022 改为部分修复，新增 B-023，并更新 C-16、活动任务索引和源仓差异。

## 验收标准

- [x] Typed OM 主路径在临时解除阅读器 auto margin 后识别 `70%` 与 `calc(...%...)`。
- [x] 不可读样式表的 `cssRules` 不会中断测量。
- [x] 几何兜底只阻止“原位留余量、叠加版心后越列”的情况。
- [x] 定向/全量 Vitest、TypeScript/Vite 构建通过。
- [x] 实书 Chromium 在默认和窄视口下均为 1/1 页，无右侧残片。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| `vitest run src/render/paginator.test.ts` | 12/12 通过 | 2026-08-18 |
| `vitest run` | 16 个文件、177/177 通过 | 2026-08-18 |
| `tsc --noEmit` | 通过 | 2026-08-18 |
| `vite build` | 通过，80 个模块 | 2026-08-18 |
| Chromium 1280×800 | 目录 `第 1/1 页`；viewer/scrollWidth `1270`；target margin `889px/24px` | 2026-08-18 |
| Chromium 900×650 | 目录 `第 1/1 页`；viewer/scrollWidth `890`；target margin `623px/24px` | 2026-08-18 |

## 不应同步的本地文件

- `<PROJECT_ROOT>/测试用epub/` 中的测试书。
- 临时浏览器脚本、截图、日志及浏览器产物。

## 待完成与风险

- 较旧 WebView 不支持 Typed OM 且无法读取书样式表时，只能进入严格几何兜底；复杂负 margin、原位无余量或作者本身越列布局有意不修正。
- Rust/Tauri 文件未变，本轮未重复跑 cargo；Windows 发布包仍需要用户最终人工复验。

## 交接说明

先读 C-16、B-012、B-022 和 `ChapterPaginator.applyBookMargins()`；不要恢复仅靠 CSSOM 扫描的实现。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
