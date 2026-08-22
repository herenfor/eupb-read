# 任务：强制横排以阅读竖排 EPUB

- 状态：待用户审核
- 创建日期：2026-08-22
- 最后更新：2026-08-22
- 对应 Bug：B-057 / C-46

## 目标

在详细设置中提供“强制横排”开关。开启后，可重排章节将 html/body、分页 viewer 及普通书内后代的 `writing-mode`/Chromium vendor 写法覆盖为 `horizontal-tb`，使现有横向多栏分页器可以阅读竖排 EPUB；关闭时完全跟随书籍。

## 非目标

- 不实现原生竖排分页，不修改 paginator 算法或 Rust。
- 不强制 `direction:ltr`，保留双向文本语义。
- 不改固定版式（pre-paginated）章节；开关对这类页面在 ReaderView 渲染层被屏蔽。
- 不声称可以恢复 SVG 未声明但仅通过祖先继承得到的原始竖排状态。

## 已确认根因

当前章节只保留书籍竖排 `writing-mode`，而 paginator 依赖横向多栏模型；竖排章节在现有容器中无法按可读的横排列流呈现。

## 必须保持的行为

- `forceHorizontal` 缺省/旧设置 undefined 等同 false。
- 设置切换沿现有 settings identity/debounce/reload 链路执行，并由 paginator 保存内容锚点。
- SVG 及其后代不匹配强制横排后代选择器；SVG 内明确声明的书籍 `writing-mode` 不被阅读器规则覆盖。
- light/dark/sepia 与横排规则相互独立。

## 实际修改

- `src/render/settings.ts`、`src/ui/storage.ts`：新增可持久化 `forceHorizontal`，默认 false。
- `src/App.tsx`、`src/ui/ReaderView.tsx`：初始化、持久化、默认重置、导入设置、菜单回调和有效渲染设置接入；固定版式屏蔽该规则。
- `src/ui/MenuPanel.tsx`、`src/styles.css`：详细设置内加入“强制横排 / 跟随书籍、竖排转横排”开关。
- `src/render/sanitize.ts`：仅开启时注入 `horizontal-tb`、`-webkit-writing-mode`、`text-orientation:mixed`，不改 direction。
- `src/ui/libraryArchive.ts`、`src/ui/libraryArchiveBridge.ts`：存档白名单接入。
- 测试覆盖 sanitizer、菜单纯 helper、设置存储、存档和固定版式边界。

## 验收标准

- [x] 关闭时不注入横排覆盖规则。
- [x] 开启时覆盖根级/嵌套竖排，含 Chromium vendor 写法。
- [x] SVG 及其后代排除；测试准确记录“显式声明可保留、未声明继承态无法凭空恢复”的边界。
- [x] 设置可在 localStorage 与阅读存档中往返，旧设置兼容。
- [x] 固定版式不启用横排覆盖。
- [x] 不修改 `direction`、paginator、Rust。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| `vitest run src/render/sanitize.test.ts src/ui/menuPanel.test.ts src/ui/storage.test.ts src/ui/libraryArchiveBridge.test.ts src/ui/libraryArchive.test.ts` | 5 文件、73/73 通过 | 2026-08-22 |
| `vitest run src/ui/readerViewSettings.test.ts src/ui/menuPanel.test.ts src/render/sanitize.test.ts` | 3 文件、58/58 通过 | 2026-08-22 |
| `tsc --noEmit` | 通过 | 2026-08-22 |
| 全量 `pnpm test` | 42 文件、359/359 通过 | 2026-08-22 |
| `tsc --noEmit`、`pnpm build` | 均通过；Vite 102 modules | 2026-08-22 |
| Root 独立 WSL Chromium 烟测：`/tmp/vertical-smoke.epub`，900×650 | 开启前 html/body/viewer=`vertical-rl`、嵌套 probe=`vertical-lr`、SVG text=`vertical-rl`，页码 1/1；菜单开启并等待 ready 后 html/body/viewer/probe=`horizontal-tb`、`text-orientation=mixed`，SVG 显式 `vertical-rl` 保持，页码仍 1/1；localStorage `forceHorizontal=true` | 2026-08-22 |
| Root 独立端口/产物检查 | 5173/5174 均无监听；临时 EPUB 与脚本不入项目 | 2026-08-22 |

## 不应同步的本地文件

- 无。

## 待完成与风险

- Windows WebView2 中需用实际竖排 EPUB 确认阅读观感、锚点恢复和长章节性能。
- 仅通过 html/body 祖先继承而未在 SVG 内明确声明的书写模式，纯 CSS 无法在排除 SVG 后代规则的同时恢复其原始继承态。

## 交接说明

Root 已独立完成全量 Vitest、TypeScript、Vite build 及 900×650 WSL Chromium 竖排烟测；用户确认后再同步真实源仓。Windows 真实竖排书/WebView2 仍待用户确认。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写

## 6. 渲染规则变更

1. 这是阅读器设置为解决竖排 EPUB 与现有横向多栏分页模型冲突，非书籍内容清理或 Rust/Chromium 特判。
2. 规则属于 L2 用户设置；`!important` 仅用于用户主动开启的横排覆盖。
3. 通用选择器覆盖 html/body/viewer 和不在 SVG 树内的普通后代；不使用书名/class 特判，不改 direction。
4. 合成章节覆盖根级竖排、嵌套竖排、SVG 显式写法和关闭/light/dark 边界。
5. 规则已登记 `rendering-layers.md` 的 C-46，并写入 `BUGFIX_LOG.md`。
