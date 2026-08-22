# 任务：拦截宿主 Ctrl/Cmd+A 全页选择

- 状态：待用户审核
- 创建日期：2026-08-22
- 最后更新：2026-08-22
- 对应 Bug：B-052

## 目标

- 书架和阅读器宿主 UI 中，非编辑区域的 Ctrl/Cmd+A 不再触发整页蓝色选择。
- 搜索框、自定义 CSS 等 `input`、`textarea`、`contenteditable` 区域继续保留原生全选行为。
- iframe 正文键盘事件也遵守同一守卫，方向键翻页不受影响。

## 非目标

- 不改变 paginator 分页、显示门、方向键和 PageUp/PageDown 翻页语义。
- 不在章节切换或设置重排时清除正文手动选择；仅在进入 reader 时清理一次宿主既有 selection。
- 不修改 Rust 或启动长期 dev server。

## 已确认根因

- App 宿主 keydown 与 iframe 内 paginator keydown 没有排除非编辑区域的 Ctrl/Cmd+A，浏览器默认行为会选择整个宿主/iframe 文档并留下蓝色 selection。

## 实际修改

- 新增 `src/render/selectionGuard.ts`：只拦截 A/a + Ctrl/Meta，编辑控件及其后代放行，并提供安全的 `removeAllRanges()` 清理 helper。
- App keydown 最先调用守卫；命中后 preventDefault、清除宿主 document selection 并返回。
- ChapterPaginator iframe keydown 使用同一守卫，命中后清除 iframe document selection；进入 reader 的 `view/bookKey` effect 清除一次宿主旧 selection。
- 增加 Ctrl/Cmd+A、普通 A、编辑控件后代、selection removeAllRanges 回归。

## 验收标准

- [x] 宿主非编辑区域 Ctrl/Cmd+A 被拦截并清除 selection。
- [x] iframe 非编辑区域 Ctrl/Cmd+A 被拦截；方向键翻页不受影响。
- [x] input/textarea/contenteditable 及其后代放行。
- [x] 进入 reader 时清理一次旧宿主 selection，章节切换不重复清理。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| selectionGuard、paginator、turnIntent 定向 Vitest | 76/76 通过 | 2026-08-22 |
| 全量 Vitest | 37 文件、337/337 通过 | 2026-08-22 |
| `tsc --noEmit` | 通过 | 2026-08-22 |
| Vite production build | 99 modules，通过 | 2026-08-22 |

## 不应同步的本地文件

- `node_modules/`、`dist/`、Rust target、测试书、截图和浏览器产物。

## 待完成与风险

- Windows WebView2 的宿主/iframe selection 与编辑控件行为仍需发布包实机确认。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
