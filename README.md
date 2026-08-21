# EPUB Reader

基于 **Tauri 2 + React + TypeScript** 的桌面 EPUB 阅读器，支持 EPUB 2.0.1 与 EPUB 3.x。

目标：

- 做一个**跨平台、轻量、尊重书内排版**的 EPUB 阅读器；
- 渲染层尽量忠实呈现书籍自己的 CSS（版心、边距、浮动、插图、脚注等）；
- 阅读器只在必要处提供统一默认值（版心宽度、主题、字号、防溢出等）。

当前主要平台为 Windows；架构上可平移 macOS / Linux，浏览器开发模式可直接运行。

Tauri 桌面版采用单实例运行；重复启动会恢复并聚焦已经运行的主窗口，而不会再创建一个独立阅读器进程。

## 功能

### 书架

- 应用启动直接进入书架；空书架居中引导导入
- 文件对话框导入 / 拖拽导入，支持**批量导入**
- 只有能成功解析、且包含可阅读内容的 EPUB 才会入库，失败文件会报告原因
- 自动去重（EPUB 完整字节 SHA-256 相同才视为同一本书；改名不影响识别）
- 封面网格（无封面时生成书名占位封面）；桌面版只为接近视口的卡片生成有界缩略图
- 新导入书籍显示“新”标记，首次打开后自动清除
- 搜索（书名/作者）、排序（最近阅读/最近添加/书名）、排布密度（舒适/标准/紧凑）与主题（浅色/深色/羊皮纸）选项
- 批量选择：支持批量删除（二次确认）；选择模式设计为通用能力，后续可扩展批量收藏/分类
- 阅读进度、最近阅读与百分比回写书架；点击卡片恢复到上次位置
- 阅读存档导入/导出：同步进度、书签和安全设置，不包含本机路径、EPUB 正文或封面缓存
- 单本删除与批量删除均带二次确认
- Tauri 环境只链接用户源 EPUB，不复制正文；源文件缺失时保留记录并支持同哈希重新定位，删除书架记录不会删除源文件
- 浏览器开发环境使用 IndexedDB 保存测试字节，只作为隔离预览后端

### 阅读器

- EPUB 2 / EPUB 3 双模解析：container → OPF（manifest/spine/guide/metadata）→ 目录
- 目录双模：EPUB 3 `nav` 优先、EPUB 2 `NCX` 兜底，缺失时用 spine 生成
- 章节隔离渲染：禁用书内脚本，危险标签/事件属性/`javascript:` 链接清除
- 自研 CSS 多栏分页：按页宽切列、翻页即滚动，自动处理图片加载重排与空列
- 阅读位置恢复：章节 + 页号 + 内容锚点，重排/设置变化后按锚点恢复
- 目录跳转（含页内锚点）、当前章节回跳开头、向前回翻自动停在上一章最后一页（加载完成后直接显示，无第一页闪帧）
- 书内脚注弹层（支持多看/掌阅类与脚本型注释模式；图片注释与超长注释可点击固定后滚动查看；弹层内不触发翻页，外链交系统浏览器）
- 主题：浅色 / 深色 / 羊皮纸，书架与阅读界面主题同步
- 排版设置：字号 12–32px；字重 300–700（细体/常规/中等/半粗/粗体）；行高、字间距、词间距
- 两套独立缩放：正文字号与界面缩放互不干扰
- 固定版式（pre-paginated）整页显示
- 问题日志：书籍不合规处分类记录，可查看
- DRM：检测到 ADEPT 等加密时明确提示，不渲染

### 渲染兼容性

阅读器注入样式按分层设计（安全 → 用户设置 → 默认版心 → 书内容 → 引擎兼容补偿），并在运行时测量修正：

- 书声明的 `width:%` 改写为 `min(百分比, 版心比例)`，窄容器中的百分比不会被误放大
- 直接子元素的书内 margin 两阶段测量，保持书的不对称缩进，同时提供默认居中
- CSS 多栏下的 `fit-content` / 浮动收缩异常补偿
- 全页插图、分隔图、脚注小图标等常见版式兼容

## 技术栈

- **外壳**：Tauri 2（Rust）
- **前端**：React 18 + TypeScript + Vite
- **解包**：fflate（前端 ZIP 解析，不依赖外部命令）
- **分页**：CSS multi-column（自研分页控制器）
- **持久化**：桌面链接书库（可同步记录 + 本机路径绑定 + 100 MiB 缩略图 LRU）；浏览器使用 IndexedDB 回退

## 目录结构

```
src/
  core/        解析内核（纯 TS，无 DOM 依赖）
    zip.ts          ZIP 解包 + mimetype 校验
    book.ts         加载编排（manifest/spine/guide/目录/字体/DRM）
    opf/ncx/nav     包文档与目录解析
    fonts.ts         IDPF 字体混淆还原
    paths/xml       路径解析与 XML 解析
  render/      渲染层
    sanitize.ts     章节消毒 + 阅读器分层样式注入
    cssRewrite.ts   CSS url() 改写与宽度兼容
    paginator.ts    分页/翻页/锚点/进度/运行时排版修正
    resources.ts    书内资源服务
    footnotes.ts    脚注识别
  ui/          界面
    ShelfView.tsx   书架
    ReaderView.tsx  阅读视图
    Toolbar / TocPanel / MenuPanel / FootnotePop / LogPanel
    shelf.ts        链接书库/IndexedDB 统一接口
    libraryArchive  无设备路径的存档校验与合并
    thumbnail.ts    近视口缩略图调度与派生
    storage.ts      设置与阅读进度
  test/        测试夹具与单元测试
src-tauri/    Tauri 2 壳 + Rust 链接书库后端
scripts/      构建/自检工具
```

## 开发环境运行

维护者开发文档见 [docs/HANDOFF.md](docs/HANDOFF.md)（架构、分层规范、测试与发布检查清单）。

使用隔离副本或不同 AI/对话协作维护时，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 与
[docs/SOURCE_DELTA.md](docs/SOURCE_DELTA.md)。后者集中记录隔离副本相对真实源仓尚未同步的变化。

需要 Node.js ≥ 20 与 pnpm：

```bash
pnpm install
pnpm dev          # 浏览器开发模式（http://localhost:5173）
pnpm test         # 单元测试
pnpm build        # TypeScript 检查 + 生产构建
```

浏览器开发模式下，书架使用 IndexedDB 持久化测试字节；阅读和渲染链路与桌面端一致，真实链接路径、重新定位与本机缓存行为需在 Tauri 中验证。

## 在 Windows 上构建桌面应用

前置条件：

1. Node.js ≥ 20
2. pnpm
3. Rust stable（MSVC 工具链）
4. WebView2 Runtime（Win10/11 一般自带）

构建：

```powershell
pnpm install
pnpm tauri build
```

或使用一键脚本：

```powershell
.\scripts\build-windows.ps1
```

产物：

- 安装包：`src-tauri\target\release\bundle\nsis\EPUB Reader_<版本>_x64-setup.exe`
- 免安装版：`src-tauri\target\release\epub-reader.exe`

桌面调试窗口：`pnpm tauri dev`。

## 测试

`pnpm test`（当前 23 个测试文件、228 个用例）覆盖：

- 解析内核：路径解析、EPUB 2/3 加载、目录双模与兜底、字体混淆还原、DRM 拒绝、缺资源容错
- 渲染层：XHTML 消毒、URL/CSS 改写、分层样式注入、宽度百分比兼容、图片与脚注处理
- 书架：书本 ID 去重、排序、搜索、时间格式化
- 怪书测试库：mimetype 错误、spine 空/幽灵 item、百分号编码路径、`linear=no` 跳读、data: URI 图片等不合规输入的容错

另有 Playwright 端到端回归：书架导入/持久化/进度恢复/批量导入/批量选择删除，翻章与目录跳转、回翻上一章无闪帧，脚注图片/固定/滚动交互，主题同步，以及多字号下的版心居中。

## 常见问题

- **`pnpm install` 报 esbuild build scripts 被忽略**：项目已放行 esbuild；如仍提示，执行 `pnpm approve-builds`。
- **打开书提示受 DRM 保护**：当前不支持 DRM 解密。
- **NSIS 打包失败**：多为首次下载 NSIS 工具链的网络问题，重试即可。
- **Linux 下构建 Tauri**：需要系统安装 `pkg-config` 与 GTK/WebKitGTK 开发包（如 `libwebkit2gtk-4.1-dev`、`libgtk-3-dev` 等）。
- **分发**：目标电脑需要 WebView2 Runtime（Win10/11 一般自带）。

## 路线图

- 搜索 / 书签 / 高亮
- 书架进阶：分组、封面缓存、备份导出
- macOS / Linux 官方打包与测试矩阵
- 更多主题与自定义字体
- 标准页进度显示与字数统计设置

## 许可

[Apache License 2.0](LICENSE)。
