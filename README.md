# EPUB 阅读器（Tauri 2 + React + TypeScript）

支持 EPUB 2.0.1 与 EPUB 3.x 的桌面阅读器，目标平台 **Windows**（架构上可平移到 Web / macOS / Linux）。

## 功能

- **打开书籍**：文件对话框或拖拽 `.epub` 到窗口
- **EPUB 2 / 3 双模解析**：container → OPF（manifest/spine/guide/metadata）→ 目录
- **目录双模**：EPUB 3 `nav` 优先、EPUB 2 `NCX` 兜底，缺失时用 spine 自动生成
- **渲染安全**：章节在隔离 iframe 中渲染，禁用书内脚本（CSP `script-src 'none'`），
  危险标签/事件属性/`javascript:` 链接全部清除
- **分页引擎（自研）**：CSS 多栏分页；等 `document.fonts.ready` 再分页；
  图片加载后自动重排；尾部空白列裁剪；空章节自动跳过
- **字体处理**：IDPF 字体混淆还原（SHA-1 + XOR）；CJK 回退链注入；
  字号 A−/A+ 调整后按原阅读比例重排
- **阅读体验**：明/暗/羊皮纸主题；翻页键（←/→、PageUp/Down、空格）；
  阅读进度自动保存（章节 + 页级，重开后恢复）
- **两套独立缩放**：正文 A−/A+（12–32px，只作用于书页）与
  界面缩放（75%–150%，只作用于工具栏/目录等 UI），互不干扰
- **问题日志**：书籍不合规处（缺资源、目录缺失、加密声明等）分类记录，可查看
- **固定版式**：`pre-paginated` 书按 viewport 整页显示
- **DRM**：检测到 ADEPT 等加密时明确提示，不渲染

暂不支持：DRM 解密、书内脚本执行、音视频、搜索/高亮/书签、媒体朗读。

## 目录结构

```
src/
  core/       解析内核（纯 TS，无 DOM 依赖，可单测）
    zip.ts        ZIP 解包 + mimetype 校验
    container→opf/ncx/nav  包文档与目录解析
    fonts.ts      IDPF 字体混淆还原
    book.ts       编排：加载整本书（资源清单/目录/加密处理）
    paths.ts      内部路径解析（..、%20、大小写）
  render/     渲染层
    sanitize.ts   XHTML 消毒 + URL 改写（blob）+ CSP/样式注入
    cssRewrite.ts CSS url() 改写
    paginator.ts  分页控制器（多栏布局、测量、空列裁剪）
    resources.ts  书内资源 → blob URL 服务
  ui/         界面（React）
    ReaderView.tsx 阅读视图（iframe + 分页器生命周期）
    Toolbar / TocPanel / LogPanel / storage
  test/       测试夹具生成器（程序化构造 EPUB 2/3）+ 单元测试
scripts/gen-icons.mjs  图标生成（PNG/ICO）
src-tauri/   Tauri 2 壳（Rust，仅窗口宿主，无业务逻辑）
```

## 开发环境运行

需要 Node.js ≥ 20 与 pnpm：

```bash
pnpm install
pnpm dev          # 浏览器中开发调试（http://localhost:5173）
pnpm test         # 单元测试（解析内核 + 消毒/改写）
pnpm build        # tsc 类型检查 + 产物构建
```

## 在 Windows 上构建桌面应用

前置条件（一次性安装）：

1. **Node.js ≥ 20**：https://nodejs.org/
2. **pnpm**：`npm install -g pnpm`
3. **Rust 工具链**：https://rustup.rs/ 安装 stable（安装后重开终端）
4. **WebView2 Runtime**：Win10/11 一般自带；缺失时
   https://developer.microsoft.com/microsoft-edge/webview2/ 安装常青版

构建：

```powershell
# 在项目根目录
pnpm install
pnpm tauri build
```

产物：

- 安装程序：`src-tauri/target/release/bundle/nsis/EPUB Reader_0.1.2_x64-setup.exe`
- 免安装版：`src-tauri/target/release/bundle/nsis/*.exe` 及
  `src-tauri/target/release/epub-reader.exe`

开发调试桌面窗口：`pnpm tauri dev`（首次编译 Rust 较慢，属正常）。

## 测试

`pnpm test`（57 个用例）覆盖：

- **解析内核**：路径解析（`..`/`%20`/大小写）、EPUB 2/3 加载（元数据/manifest/spine/
  目录双模/兜底）、字体混淆还原、DRM 拒绝、缺资源容错
- **渲染**：XHTML 消毒（脚本/事件属性/SVG 内嵌脚本清除、URL 改写、CSP 注入、
  XML 失败降级）、CSS url() 改写、编码容错（UTF-8 / UTF-16LE/BE BOM）
- **怪书测试库**（`src/test/weirdBooks.test.ts`，每类"不合规但必须能读"的场景一个用例）：
  空章节（只有注释）、mimetype 错误、未知加密算法、混淆声明指向非字体、
  spine 为空、spine 引用幽灵 item、manifest item 缺 id、百分号编码路径、
  `linear=no` 旁置章节跳读、EPUB2 `meta name=cover` + guide、data: URI 图片、
  非样式表 link 移除

测试书全部由 `src/test/fixtures.ts` 程序化构造（`buildEpub` 可生成 EPUB 2/3、
内嵌字体、混淆字体、DRM 声明、固定版式等），无需外部样例文件。

## 合规书自检（真实样例验证）

`scripts/` 提供两个工具：

```bash
# 1. 把解包的 EPUB 源码树打包回合法 .epub（mimetype 第一个条目且不压缩）
pnpm pack <源码目录> [输出.epub]

# 2. 用阅读器自己的解析内核检查一本书（输出报告，退出码 0=通过）
pnpm check book.epub [更多.epub ...]
```

`check` 报告：版本/元数据/spine/资源/目录结构、逐章资源存在性、目录条目可跳转性、issue 列表。

已用官方样例验证（见 `samples/`，全部零 issue）：

| 样例 | 版本 | 来源 | 规模 |
|---|---|---|---|
| `samples/alice2.epub` | EPUB 2.0.1 | Readium demos（爱丽丝） | 13 章 / 59 资源 |
| `samples/moby-dick.epub` | EPUB 3 | IDPF epub3-samples（官方） | 144 章 / 151 资源 |
| `samples/childrens-literature.epub` | EPUB 3 | IDPF epub3-samples（官方） | 3 章 / 7 资源 |

另对 Readium 一致性测试书（19 本 Tiny-*，含 FXL/竖排 RTL/SVG/MathML/脚注）与
EPUB 3 官方测试套件（24 本 epub30-test-*）做了全量扫描：**全部合规书零 issue**；
唯一报错的是刻意损坏的负向测试书 TIny-3-Bad（正确降级为"章节资源缺失"而不崩溃）。
扫描中修复了三个真实兼容性问题：旧版 IDPF 字体媒体类型
（`application/font-woff` 等）的混淆还原、`remote-resources` 远程资源的容器内
查找规则、混淆声明指向非字体资源的容错。

在 Windows 上可再用官方校验器交叉验证：epubcheck（需 Java，
https://github.com/w3c/epubcheck/releases ，`java -jar epubcheck.jar book.epub`）。

## 阶段性打包（部署到其他电脑测试）

一键脚本（Windows PowerShell，项目根目录执行）：

```powershell
.\scripts\build-windows.ps1
```

手动步骤（与脚本等价）：

```powershell
pnpm install
pnpm build          # 前端：tsc 类型检查 + vite 生产构建
pnpm tauri build    # Rust + NSIS 打包（首次 5-15 分钟）
```

产出：

- 安装包：`src-tauri\target\release\bundle\nsis\EPUB Reader_0.1.2_x64-setup.exe`
- 免安装版：`src-tauri\target\release\epub-reader.exe`

**从 WSL 复制项目到 Windows 时**（排除平台无关的生成目录，Windows 侧重新安装依赖）：

```powershell
robocopy "\\wsl.localhost\Ubuntu-25.04\home\herenfor\test\epub-reader" "C:\epub-reader" /E /XD node_modules .pnpm-store dist .pw-browsers .pw-libs src-tauri\target /NFL /NDL /NJH
```

**分发注意事项**：

- 目标电脑需有 **WebView2 Runtime**（Win10/11 自带；缺失时到
  https://developer.microsoft.com/microsoft-edge/webview2/ 安装常青版）
- 免安装 exe 需要与 WebView2 配合；安装包（NSIS）体验更完整（开始菜单/卸载入口）
- 早期版本建议带上版本号分发（当前 0.1.2），改版本号：
  `src-tauri/tauri.conf.json` 与 `package.json`、`src-tauri/Cargo.toml` 三处同步

## 常见问题

- **pnpm 安装报 "Ignored build scripts: esbuild"**：`pnpm-workspace.yaml` 已放行
  （`allowBuilds: { esbuild: true }`）；若仍出现，执行 `pnpm approve-builds` 允许 esbuild。
- **`pnpm tauri build` 失败于 NSIS**：多为首次下载 NSIS 工具链的网络问题，重试即可。
- **打开书报"受 DRM 保护"**：该书使用 Adobe ADEPT 等 DRM，本阅读器不支持。
- **某章渲染与 Chrome 不一致**：Windows 上 WebView2 即 Chromium 内核，一般一致；
  iOS/Android 平台将来接入时需按平台建测试矩阵。

## 路线图（后续迭代）

- 搜索 / 书签 / 高亮
- 章节内锚点高亮定位（CFI 参考实现）
- 书内脚注弹层
- 更多主题与自定义字体
- 跨平台：Web 版（已兼容）、macOS/Linux 打包
