# B-029：CSS 注释边界与资源改写

- 状态：代码、自动化回归与 Chromium 端到端已完成，待用户审核/同步
- 版本：0.1.7
- 发现日期：2026-08-18

## 现象与根因

部分 EPUB 的 CSS 在注释中包含可读的 `@import`、`url()`、`width` 或 `float` 文本。旧实现使用未区分 CSS 注释的正则扫描：注释内的 `@import` 可能被读取并内联，随后生成的注释提前闭合，令导入内容泄漏为有效规则；注释关键词也会误导图片尺寸、祖先定宽和 float 宽度判断。字符串中的 `/*...*/` 则不应被当成注释。

## 选择的修复

- `cssRewrite.ts` 增加 quote-aware、支持转义与未闭合注释的保护/恢复扫描器；只有 normal state 的 `/*...*/` 会被保护。
- 根调用和递归 `@import` 共享 comment token context，子 CSS 的注释直到根调用结束才恢复，避免父级后续 URL/width pass 再次看到注释内容。
- `rewriteCssUrls` 的 import、url、width 扫描只处理保护后的文本；注释原文逐字恢复。inline style 的百分比 width 使用同一边界规则的专用 helper。
- sanitize 的祖先 width、纯图片尺寸和 paginator 的 float guard 均使用 comment-safe authored-property 判断；CSSOM/Typed OM 和自定义 CSS 注入路径不变。

## 验证

- 定向：`cssRewrite` 24/24，`sanitize` 51/51，`paginator` 21/21，共 96/96。
- 全量：17 个文件、197 个用例通过；`tsc --noEmit` 与 Vite build 通过。
- 已覆盖：注释内 import 不读取且不泄漏、递归导入注释、未闭合注释、字节保留、quoted URL comment-like 字符、注释关键词、sanitize 祖先/图片边界、paginator float guard。
- Chromium 已使用 WSL Chromium（通过 `.pw-libs` 的 `LD_LIBRARY_PATH` 启动）完成 sanitize 外链 CSS 端到端验证：`hiddenReads=0`；重写 CSS 逐字保留 `/* @import "hidden.css"; */`，活动 `.real` 背景 URL 为 `blob:test/OEBPS/Styles/active.png`；CSSOM 仅有 `.real`，hidden 为 `rgb(0,0,0)`，real 为 `rgb(0,0,255)`。临时脚本 `/tmp/verify-comment-sanitize.mjs` 不属于同步内容。
- 剩余风险：现有测试书的普通回归与 Windows WebView2/安装包确认仍按发布流程完成。

## 交接清单

- [x] 代码与失败回归
- [x] `BUGFIX_LOG.md`、`MODULE_CONTRACTS.md`、`rendering-layers.md`
- [x] `SOURCE_DELTA.md`、`PROJECT_CONTEXT.md`、活动任务索引
- [x] 已补充 sanitize 外链 CSS 的 Chromium 端到端结果
