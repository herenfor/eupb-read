# 任务：阅读跳转历史返回（Undo 跳转）

- 状态：已同步
- 创建日期：2026-08-18
- 最后更新：2026-08-18
- 对应 Bug：无（0.1.6 功能）

## 目标

用户通过目录或书内链接跳转后，可一键返回跳转前的阅读进度（章节 + 页码 + 内容锚点）。只支持撤回，不支持前进；历史最多 10 步。按钮放在阅读器工具栏“☰ 菜单”左侧。

## 实际修改

- `src/App.tsx`：新增 `readerHistory` 状态（≤10）；`handleTocNavigate` 在跳转前记录当前位置；新增 `handleHistoryBack` 恢复位置（设置 spineIndex、anchorNonce、initialPage、initialAnchor）；打开新书时清空历史。
- `src/ui/Toolbar.tsx`：新增可选 `onHistoryBack` / `canHistoryBack`，在菜单按钮右侧渲染“↩”按钮，无历史时禁用。
- `src/ui/ReaderView.tsx`：`initialAnchorRef` 改为随 `props.initialAnchor` 更新，使同一 ReaderView 生命周期内的历史回退能恢复内容锚点。

## 验证

- `pnpm test`：16 文件 174/174 通过。
- `pnpm build`：通过。
- Chromium：铁人书 第二章第 2/7 页（27%）→ 目录跳到第五章 → 点 ↩ → 恢复第二章第 2/7 页（27%）。

## 待确认

- 目录连续多次跳转后最多保留 10 步；
- 普通翻页/翻章不计入历史，只记录显式跳转。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [x] 用户已审核并同步到真实源仓
- 源仓提交：`d934588b6518dca819e72d2f129a68225cba6592`，最终 0.1.6 基线 `e8aabcdeb03543402338aee00fb2e33d52e39841`
