# 任务：书架全选、用户自定义字体与自定义 CSS

- 状态：已实现，本地验证完成，待用户审核/Windows 打包确认
- 创建日期：2026-08-18
- 对应 Bug：无（0.1.6 功能）

## 目标

1. 批量删除选择模式增加“全选/取消全选”，范围为当前筛选结果。
2. 高级设置支持用户上传字体文件（TTF/OTF/WOFF/WOFF2），在渲染层注入 `@font-face`，选择后强制正文 `body{font-family}`，不改书文件。
3. 高级设置支持用户自定义 CSS 文本，注入到阅读器覆盖样式表末尾，允许覆盖书与阅读器规则。
4. 字体文件持久化：Tauri 存应用数据目录 `fonts/` + `fonts.json`；浏览器开发环境存 IndexedDB。

## 实际修改

- `src/ui/fontStore.ts`：`UserFont` 模型、Tauri/IndexedDB 双实现（IndexedDB keyPath 为顶层 id）。
- `src/render/settings.ts`：`ReaderSettings` 增加 `customFontName/customFonts/customCss`。
- `src/render/sanitize.ts`：注入用户 `@font-face`、选择字体时 `body{font-family:...!important}`、末尾注入用户 CSS。
- `src/ui/MenuPanel.tsx`：详细设置内增加“自定义字体”（上传/选择/删除）和“自定义 CSS”textarea。
- `src/App.tsx`：字体列表加载、字体上传/删除、字体 blob URL 构造与生命周期、设置持久化；`renderUserFonts` 用 `useMemo` 稳定引用。
- `src/ui/ReaderView.tsx`：接受 `userFonts` 并合入渲染层设置，设置/字体变化触发 `reloadWithSettings`。
- `src-tauri/src/lib.rs`：`fonts_import_raw/fonts_list/fonts_read/fonts_delete`，字体目录与 `fonts.json`，独立 `FontWriteState` 互斥。

## 验证

- `pnpm test`：16 文件 174/174 通过（新增 fontStore 2、sanitize 2）。
- `pnpm build`：通过。
- `cargo fmt`：通过；完整 `cargo check` 仍因沙箱跨目录 rename 无法在隔离沙箱执行，需有权限 shell/Windows 编译确认。
- Chromium：
  - 批量选择：导入 3 本 → 全选 → 已选 3 本 → 取消全选 → 已选 0 本。
  - 自定义 CSS：`#epub-viewer p { color: red !important; }` 生效，正文 `p` computed color = red。
  - 字体上传：dummy.ttf 上传后字体列表出现 1 项。

## 待完成/风险

- Windows WebView2/NSIS 未重新编译；Rust 字体命令需在 Windows 打包时最终验证。
- 字体内容没有做文件魔数校验，仅按扩展名过滤；未来可加 `ttf-parser` 等校验。
- 未处理同一字体多文件/多 weight 的 family 合并，后续用户上传字体系列时可再扩展。
