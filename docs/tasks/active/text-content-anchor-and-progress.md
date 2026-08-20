# 任务：文本内容锚点与当前章进度准确性

- 状态：代码、自动化与 WSL Chromium 回归完成，待 Windows WebView2 审核
- 创建日期：2026-08-20
- 对应 Bug：B-037

## 目标

- 页面中心仅作为 caret 文本采样坐标；不写 padding、margin、transform，不插入节点，也不改变多栏分页。章节始终从自然第一列开始。
- 保存 Unicode code point 口径的 `anchorTextOffset` 与至多 32 code point 的无空白 `anchorTextSnippet`；文本定位优先，旧元素 index/ratio 与页码依次兜底。
- 旧书架/存档省略新字段时归一为 null；书签、历史、浏览器存储、v1 portable archive、Tauri record/view/IPC 使用同一字段。

## 实现

- `VisibleTextIndex` 每章在成功 measure 后单次 TreeWalker 建立，跳过 script/style、阅读器明确隐藏的脚注及 computed hidden/collapse 子树；祖先可见性用缓存避免重复 computed-style 读取。偏移与 snippet 均按 code point，Range 仍映射到 UTF-16 offset。
- 恢复自然完成布局后：原 offset+snippet 校验 → 有界线性 snippet 漂移搜索（重复命中取距旧 offset 最近）→ 严格 legacy index/ratio（越界无效、不 clamp）→ saved page → 第 0 页。fragment/startAtEnd 最后覆盖入口位置。
- legacy 成功只选列，随后在该列只读中心采样升级为文本锚点；caret 不可用或图片章继续保留 legacy。保存时内部 text-only sentinel 不写入 `anchorIndex`。
- 当前章分子优先 text offset；仅 legacy 未升级时才按当前页比例估算。`linear=no` 保持可恢复，但只累计此前 linear spine 项，不再 `slice(0,-1)`。

## 验证

- 定向前端 8 文件 70/70；全量 Vitest 27 文件 250/250；TypeScript/Vite build 通过。
- Rust 11/11、`cargo fmt --check`、`cargo check --quiet` 通过。
- WSL Chromium 实书矩阵已完成：1280×800 缩至 900×650 后阅读片段仍保留；返回书架再打开的中心锚点一致；连续无延迟两次字号+后旧 snippet 仍在当前页可见，首列自然原点没有被锚点改写。
- Windows WebView2 IPC round-trip 与发布包仍需用户人工确认。

## 非目标

- 不做全书 chapterChars/分母口径或后台扫描，不做同章导航优化、预加载、缓存和跨章性能改造。
