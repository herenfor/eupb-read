# 开发文档

本文档面向维护者与贡献者，介绍项目结构、开发命令、渲染分层规范与回归测试方式。

> 项目自述与功能列表见根目录 [README.md](../README.md)。

## 技术栈

- 外壳：Tauri 2（Rust）
- 前端：React 18 + TypeScript + Vite
- EPUB 解包：fflate（纯前端 ZIP 解析）
- 分页：CSS multi-column（自研分页控制器）
- 测试：Vitest（单元测试）+ Playwright（端到端回归）

## 架构分层

```
src/
  core/        解析内核（纯 TS，无 DOM 依赖）
    zip.ts         ZIP 解包 + mimetype 校验
    book.ts        加载编排（manifest/spine/guide/目录/字体/DRM）
    opf/ncx/nav    包文档与目录解析
    fonts.ts        IDPF 字体混淆还原
    paths/xml      路径解析与 XML 解析
  render/      渲染层
    sanitize.ts     章节消毒 + 阅读器分层样式注入
    cssRewrite.ts   CSS url() 改写与宽度兼容
    paginator.ts    分页/翻页/锚点/进度/运行时排版修正
    resources.ts    书内资源服务
    footnotes.ts    脚注识别（含图片/富文本注释）
  ui/          界面
    ShelfView.tsx   书架（网格/搜索/排序/密度/主题/批量选择）
    ReaderView.tsx  阅读视图
    Toolbar / TocPanel / MenuPanel / FootnotePop / LogPanel
    shelf.ts        Tauri 链接书库 + IndexedDB dev 的统一接口
    libraryArchive  无设备路径的存档 schema、校验与合并
    thumbnail.ts    近视口缩略图队列与派生
    storage.ts      设置与阅读进度
  test/        测试夹具与单元测试
src-tauri/    Tauri 2 壳（Rust 链接书库、缩略图缓存与字体命令）
scripts/      构建/自检/测试工具
```

## 开发命令

```bash
pnpm install
pnpm dev          # 浏览器开发模式（localhost:5173）
pnpm test         # 单元测试（当前 319 项）
pnpm build        # TypeScript 检查 + 生产构建
pnpm tauri dev    # 桌面窗口调试（需要系统 Tauri 依赖）
pnpm tauri build  # 桌面打包
```

Windows 一键打包见 `scripts/build-windows.ps1`；0.1.8 的 WSL→Windows 安全同步与测试版验收见 `docs/RELEASE_0.1.8.md`。

## 渲染分层规范

阅读器注入样式遵循五层模型，避免规则互相打架：

| 层 | 职责 | 示例 |
|---|---|---|
| L1 安全/消毒 | 删除脚本、危险属性、隐藏脚注 aside | `#viewer aside[epub:type=footnote]{display:none!important}` |
| L2 用户设置 | 字号、主题、行高、字重、间距 | `html{font-size:...!important}`、主题色 |
| L3 阅读器默认版心 | 40rem 版心、页面级居中、图片防溢出 | `:where(#viewer .reader-top){max-width:40rem}` |
| L4 书内容布局 | 书的 margin/width/max-width/float/font 设计 | 不注入，运行时测量后决定 |
| L5 引擎兼容补偿 | CSS 多栏的 fit-content / float 收缩异常 | 运行时按触发条件兜底 |

完整说明、每条规则的冲突台账与新增规则检查清单见 [rendering-layers.md](rendering-layers.md)。

## 关键设计

### 分页与阅读位置

- 页面宽度 = 窗口全宽，内容宽度由 40rem 版心控制；
- 阅读位置 = 章节索引 + 页号 + 内容锚点（元素序号 + 元素内横向比例 + 字数位置）；
- 字号/窗口变化后按锚点恢复，页号只在锚点失效时兜底。

### 宽度百分比兼容

书里的 `width:X%` 按“页面 ≈ 版心”书写，阅读器页面是全窗口宽。为避免 90% 的盒子占满整页、同时又避免误伤 td 等窄容器，改写为：

```css
width: X% → width: min(X%, X/100 × 40rem)
```

页面级取版心比例，窄容器由浏览器按真实包含块取较小值；`>100%` 的出血意图保持原样。

### 脚注弹层

- 支持多看/掌阅类和脚本型 `<note>` 两类结构；
- 支持图片注释（弹层渲染富内容 HTML）；
- 悬停临时展示，点击固定；固定后可在弹层内滚动超长内容；
- 弹层内滚轮不触发翻页；返回链接跳回正文标记；外链交系统浏览器。

### 书架存储

- Tauri 环境使用链接式书库，用户源 EPUB 留在原路径，不复制到应用目录，也不会在删除书架条目或卸载时被应用删除。
- 可同步状态保存为 `app_local_data_dir()/linked-library/library-records.json`；本机绝对路径、stat 与封面 ZIP 定位单独保存为 `device-bindings.json`。书籍 ID 是 EPUB 完整字节的小写 SHA-256。
- 设备缩略图位于 `app_local_data_dir()/linked-library/thumbnails/`，最大 240×360、全局四并发、单项 5 MiB、LRU 总上限 100 MiB；启动会清理索引外孤立文件和临时文件。
- 重复导入只更新同哈希的本机绑定，不覆盖进度、书签或首次添加时间；源文件缺失时保留记录，重新定位必须再次匹配完整哈希。
- “导出存档”产生不含路径、正文、封面和缩略图的 v1 JSON；浏览器开发环境仍使用 IndexedDB 保存测试字节，只是 UI 语义回退，不代表桌面持久化设计。
- 完整实现与 Windows 待验收项见 `docs/tasks/active/linked-library-refactor.md`，不要恢复旧 `shelf.json`/`books/<id>` runtime 命令。

## 测试

### 单元测试

当前 `pnpm test` 基线为 35 个测试文件、319 项；另有 Rust 13 项测试。覆盖解析内核、消毒与 CSS 改写、脚注识别、链接书库/存档/缩略图、桌面单实例恢复顺序、阅读历史状态机、书架纯函数、怪书容错及分页交互回归等。

### 端到端回归

使用项目内 Playwright 无头浏览器，重点覆盖：

- 书架：导入/批量导入、去重、进度恢复、批量选择删除、搜索排序、主题同步；
- 阅读：翻章、回翻上一章停在最后一页（无第一页闪帧）、目录跳转、页内锚点；
- 脚注：图片注释、固定弹层、超长滚动、弹层上不翻页；
- 渲染：多字号版心居中、书内百分比宽度兼容。

运行端到端脚本需要先构建前端（`pnpm build`），并准备好无头浏览器依赖（见 `scripts/setup-pw-fonts.mjs` 与 Playwright 文档）。

## 桌面构建

跨平台原则：各平台使用本机工具链原生编译，不做交叉编译。

- Windows：MSVC + WebView2，`scripts/build-windows.ps1`；
- Linux：需 `pkg-config`、GTK/WebKitGTK 开发包；
- macOS：需要 macOS 系统与 Xcode Command Line Tools。

版本号需保持四处一致：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、根包在 `src-tauri/Cargo.lock` 中的版本。

## 发布前检查清单

1. `pnpm test` 全部通过；
2. `pnpm build` 通过；
3. 真机（各目标平台）至少执行一次书架导入/阅读/返回/重启恢复；
4. 版本号三处一致；
5. 更新 README 功能列表与本文档变更记录。
