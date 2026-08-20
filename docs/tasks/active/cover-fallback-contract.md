# 任务：链接书库封面 fallback 契约

- 状态：代码与自动化完成，待 Windows 发布包审核
- 创建日期：2026-08-20
- 最后更新：2026-08-20
- 对应 Bug：B-048 / C-41

## 目标

让浏览器预览与 Tauri 桌面链接导入对 `cover.webp` 等非标准但常见封面使用同一、稳定且低成本的 fallback 规则。

## 非目标

- 不修改自定义 CSS 字体调用；已声明的书内 `font-family` 保持可用。
- 不解析 EPUB2 guide 指向的 XHTML 封面页。
- 不扫描 ZIP 全部文件、不解压/解码候选、不增加全书哈希或启动时旧库扫描。
- 不迁移已有 binding；测试版本可重新导入以刷新封面定位。

## 当前现象与证据

- 样本结构：`<item id="image001" href="Images/cover.webp" media-type="image/webp"/>`。
- 浏览器预览的 TypeScript 解析器原本按资源文件名可找到封面；Windows 发布版缺封面。
- 发行版的导入路径为原生 Rust `linked_library_import_paths`，不是 WebView2 调用 `loadBook()`；旧 Rust 兜底只检查 manifest ID 是否包含 `cover`，故漏掉 `image001`，也可能误选 CSS/XHTML。

## 已确认根因

封面候选规则在 TypeScript 与 Rust 两个解析器中分叉。问题不在 WebView2 对 WebP 的解码支持。

## 必须保持的行为

- 标准 EPUB3 `properties="cover-image"` 优先于 EPUB2 meta 和文件名 fallback。
- EPUB2 `<meta name="cover" content="item-id">` 仍能按 item ID 定位图片。
- 无效的高优先级候选必须继续下一层，不得把缺失路径保存进 binding。
- 候选顺序由 OPF manifest 源顺序确定，不能受 HashMap 顺序影响。
- 重复导入只更新同 hash 的设备 binding，保留进度、书签和首次添加时间。

## 实际修改

- Rust 以有序 manifest 保存 OPF item；选择顺序为 EPUB3 `cover-image`、EPUB2 `meta cover`、href basename stem 大小写无关精确为 `cover`。
- 候选 href 去除 query/fragment 后 URL 解码并相对 OPF 路径规范化；候选必须为 `image/*` 或由 jpg/jpeg/png/webp/avif/gif/svg 扩展名推断，并由已打开 ZIP 的 `by_name` 确认存在。
- 前端 `loadBook()` 使用同一顺序和有效性边界；manifest 资源路径也统一去除 query/fragment，保证 URL 编码封面与 ZIP 条目匹配。
- 删除 Rust `id.contains("cover")` 模糊 fallback。

## 性能

- OPF 解析时顺带保留 manifest，时间为 O(manifest 项数)。
- 每个少量候选仅查询已打开 ZIP 中央目录的 `by_name`；不读取图片字节，不解压、解码或额外打开 EPUB。
- 因此不改变批量导入时的流式 SHA-256、一次性索引提交、低内存链接书库设计；不增加启动时成本。

## 验收标准

- [x] `id=image001` + `Images/Cover%2EWEBP?cache=1#preview` 可定位真实 `Cover.WEBP`。
- [x] 失效 EPUB3 声明、EPUB2 指向 CSS 后继续使用有效 `cover.webp`。
- [x] manifest 顺序确定，错误 MIME 可由受支持扩展名推断。
- [ ] Windows 发布包导入真实 `cover.webp` EPUB 后显示书架封面。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| 修改前 `vitest run src/test/weirdBooks.test.ts` | 新回归失败：返回缺失 `OEBPS/missing.jpg` | 2026-08-20 |
| 修改后定向 Vitest | `weirdBooks` 19/19 通过 | 2026-08-20 |
| Rust 单元测试 | 13/13 通过（含 filename、无效上层候选与 MIME 推断回归） | 2026-08-20 |
| Rust 格式/检查 | `rustfmt --check`、`cargo check` 通过；环境未提供 cargo fmt 子命令 | 2026-08-20 |
| 全量前端 Vitest、TypeScript、生产构建 | Vitest 34 文件、315/315；`tsc --noEmit` 与 `pnpm build`（95 modules）通过 | 2026-08-20 |

## 不应同步的本地文件

- 私有 EPUB、临时合成 ZIP、截图、浏览器产物、`node_modules`、`dist` 与 Rust `target`。

## 待完成与风险

- 当前没有启动 Chromium；封面元数据定位不需要渲染验证。
- Windows WebView2/发布包仍需用真实 `cover.webp` 书验证导入、书架缩略图派生和重复导入 binding 刷新。
- 不能解码的未知 `image/*` 仍会按既有缩略图失败路径显示无封面；本任务不将其错误替换为非标准候选。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
