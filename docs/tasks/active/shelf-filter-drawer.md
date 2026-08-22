# B-062/C-51：书架筛选抽屉与 OPF 语言元数据

- 状态：隔离副本实现、自动化与 WSL Chromium 实书验收完成；待 Windows WebView2 视觉及原生导入实机确认，尚未同步。
- 目标：把搜索、排列方式、排布密度、主题及存档导入/导出收进书架二级抽屉；“全部书籍”展开作者、书名、保存时间和语言组合筛选；书架视图去掉顶部“EPUB 阅读器”工具栏并上移内容。
- 非目标：本轮不做标签、出版社、出版年份、跨书语义分类或启动时扫描源 EPUB；不迁移/重写 OPF 原始作者与书名。

## 数据与性能契约

- `ShelfEntry.language`/`LibraryRecord.language` 为可选 OPF `dc:language`。浏览器与 Rust 原生导入均取第一个非空语言；旧记录/旧 v1 存档缺失时归入“未知语言”，不得为补字段批量读取源 EPUB。
- 作者分组键先做 Unicode NFKC，使全角数字/字母归一；只删除汉字、平假名、片假名之间的 `White_Space`/`Cf` 字符，保留西文姓名空格。原始 `creator` 继续用于卡片和存档，不被覆盖。
- 语言按 BCP-47 主标签归组；保存时间使用互斥的今天、最近 7 天、最近 30 天、今年、更早。
- `createShelfFilterModel()` 单次建立内存索引并同时返回结果和交叉筛选计数；UI 必须复用该模型，不另建不同规范化规则。折叠的全部书籍/分类不渲染选项，长列表最多显示 80 项并提供分类内搜索。

## UI 契约

- 抽屉支持 backdrop、关闭按钮、Escape、打开后聚焦搜索、关闭后焦点回到菜单按钮，并保留 `aria-expanded`/dialog 语义。
- 动画限于 backdrop opacity、抽屉 transform 与分类 grid-row/opacity；`prefers-reduced-motion` 时禁用。
- 页首只保留菜单、书架标题、数量、批量删除和导入书籍。书架不渲染全局 Toolbar；进入阅读器后 Toolbar 与实际书名照常显示。

## 验证

- 前端全量 Vitest：52 files/407 tests；TypeScript 与 Vite build（110 modules）通过。
- Rust：`cargo fmt --check`；19/19 tests，通过 OPF language、旧记录 serde default 和既有链接书库回归。
- WSL Chromium 760×620：《ePub指南——从入门到放弃》语言为“中文”；书架 Toolbar=0、顶部 y=0、页首搜索/下拉=0；抽屉动画和搜索焦点有效，折叠时 section/options=0，展开全部书籍后 4 个 section、仅展开语言时 1 个 option；排列/密度/主题及两项存档操作均在抽屉；Escape 焦点回到菜单；打开书后 Toolbar=1 且标题为书名。
- B-063 补充：`.shelf-drawer-scroll` 作为抽屉 flex 列的剩余区显式 `flex: 1 1 auto`。800px 高窗口主题下拉前后均为 clientHeight=scrollHeight=730，无伪滚动条；480px 窗口滚动区占满标题以下 410px，真实溢出时滚动轨道贯穿可用高度。
- B-064 补充：提高抽屉搜索框规则作用域，避免后置 `.shelf-search` 覆盖专用 padding；输入框增至 42px 高、14px 字号，左侧为 20×20/21px 图标并预留 42px 左 padding。Chromium 实测图标与输入框中心偏差 0、图标右缘到文字起点 9px。
- B-065 补充：文本字符 `⌕` 的字体基线/内部留白会造成“元素盒居中但字形视觉偏下”，已改为固定 24×24 viewBox 的 18px SVG 描边图标，不再依赖 Windows 系统字体。2×截图与 Chromium 几何复验均为输入框中心 y=105、SVG 中心 y=105。
- B-066 补充：滚动区使用 `scrollbar-gutter:stable`，在筛选展开前预留纵向滚动槽。620px 高窗口中展开前 550=550、展开后 608>550，但滚动区宽度始终 379px、全部书籍卡片始终 347px，不再因滚动条出现而横向缩窄。
- 临时脚本与截图已删除，5173 已释放。

## 待验收

- Windows 发布版原生导入后语言筛选是否正确；旧书记录显示“未知语言”。
- 100+ 本真实书库的抽屉滚动、组合筛选响应和三种主题视觉。
