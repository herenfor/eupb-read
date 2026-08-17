# 任务：书签功能

- 状态：已实现，本地验证通过
- 创建日期：2026-08-18
- 对应 Bug：无（0.1.6 功能）

## 目标

- 书签记录当前阅读进度（章节 + 页码 + 内容锚点 + 锚点行文字），随书存储、随书删除。
- 工具栏在目录左侧新增书签按钮（🔖）+ 下拉按钮（▾），下拉二级菜单展示本书所有书签。
- 书签按钮在当前页有书签时高亮；翻页后恢复，翻回该书签页重新高亮。
- 点击书签跳转到对应进度；书签跳转支持 ↩ 撤回（进入跳转历史）。
- 书签列表每行：激活图标 + 锚点行文字，过长省略。

## 实际修改

- `src/ui/shelf.ts`：新增 `Bookmark` 类型与 `ShelfEntry.bookmarks`；`ShelfStore.setBookmarks`；IndexedDB 保存/写入；Tauri 调用新命令。
- `src-tauri/src/lib.rs`：`ShelfEntry` 增加 `bookmarks`；新增 `shelf_set_bookmarks` 命令并注册；旧索引兼容（`Option` 缺省）。
- `src/render/paginator.ts`、`src/ui/ReaderView.tsx`：新增 `getAnchorText()` 供书签记录行文字。
- `src/ui/Toolbar.tsx`：新增书签按钮 + 下拉按钮 + 二级书签弹层（激活图标 + 省略号文字）。
- `src/App.tsx`：书签乐观增删、跳转前写入历史、书签跳转恢复位置、书签菜单状态管理。

## 验证

- `pnpm test`：16 文件 174/174 通过。
- `pnpm build`：通过。
- `cargo fmt`：通过；`cargo check` 需有权限 shell/Windows 最终确认。
- Chromium：第二章第 2/7 页添加书签 → 按钮高亮、下拉显示锚点文字 → 跳到第五章 → 书签跳回第 2/7 页 → 再次点击书签按钮移除并取消高亮。

## 待确认

- 书签按“当前页”判定高亮；同一页内锚点不同不会显示多个高亮。
- Rust 命令与 Windows 打包待最终确认。
