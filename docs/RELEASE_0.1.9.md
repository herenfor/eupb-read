# 0.1.9 测试发布说明

- 状态：发布候选，待 Windows 编译、分发和实机验收
- 版本：`0.1.9`
- 日期：2026-08-23
- 源仓比较基线：`v0.1.6` / `e8aabcdeb03543402338aee00fb2e33d52e39841`

## 版本一致性

以下四处必须同时为 `0.1.9`：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 中 `name = "epub-reader"` 的根包版本。不得批量替换 Cargo.lock 中其他依赖的版本号。

## 从 WSL 同步到 Windows

在 Windows PowerShell 中执行。旧目录会先改名备份，Windows 本机的 `node_modules` 会迁入新目录，WSL 构建产物和平台依赖不会复制。

```powershell
$ErrorActionPreference = "Stop"
$src = (wsl.exe wslpath -w /home/herenfor/test/epub-reader).Trim()
$dst = "D:\杂物\eupb-reader"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "D:\杂物\eupb-reader.before-0.1.9-$stamp"

if (-not (Test-Path -LiteralPath $src)) {
    throw "找不到 WSL 项目目录：$src"
}

if (Test-Path -LiteralPath $dst) {
    Rename-Item -LiteralPath $dst -NewName (Split-Path $bak -Leaf)
}
New-Item -ItemType Directory -Path $dst | Out-Null

if (Test-Path -LiteralPath "$bak\node_modules") {
    Move-Item -LiteralPath "$bak\node_modules" -Destination "$dst\node_modules"
}

robocopy $src $dst /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 `
  /XD node_modules dist target target2 gen targettmp .git .pnpm-store `
      .pw-browsers .pw-libs .pw-libs-debs .cache .toolchain .xwin-cache .tmptsx `
  /XF *.log .img-repro.png repro-redmoon.mjs
$copyCode = $LASTEXITCODE
if ($copyCode -ge 8) {
    throw "robocopy 失败，退出码：$copyCode"
}

Set-Location $dst
```

若 `wslpath` 未返回可用路径，可将 `$src` 手工设为 `\\wsl.localhost\Ubuntu\home\herenfor\test\epub-reader`（发行版名以 `wsl.exe -l -q` 为准）。确认新版构建正常后再手动删除 `$bak`。不要删除 AppData 中的应用数据，否则无法验证旧书库和阅读进度的兼容性。

## Windows 编译

```powershell
node -v
pnpm -v
rustc -V
cargo -V

pnpm install --frozen-lockfile
pnpm test
pnpm tauri build
```

`pnpm tauri build` 会自动执行前端 `pnpm build`。也可以使用 `./scripts/build-windows.ps1`，但一键脚本不运行 Vitest，发布前仍应单独执行 `pnpm test`。

## 构建产物

- 安装包：`src-tauri\target\release\bundle\nsis\EPUB Reader_0.1.9_x64-setup.exe`
- 免安装版：`src-tauri\target\release\epub-reader.exe`

## 不同步内容

- WSL 的 `node_modules/`、`dist/`、Rust `target/target2/gen/`；
- `.pw-browsers/`、`.pw-libs/`、`.pnpm-store/`、缓存和工具链目录；
- 私有测试 EPUB、截图、日志、临时复现脚本与 AppData 书库数据。

## 发布前状态

0.1.9 包含 0.1.8 后的系统字体中心、当前书正文搜索、正文笔记、实验性前后相邻章节预渲染和书架二级筛选抽屉等功能。版本提升后已通过 Vitest 52 文件/407 用例、TypeScript、Vite production build（110 modules）、Rust fmt/check/test（19/19）；Cargo metadata 识别 `epub-reader@0.1.9`。Chromium UI 链路沿用本轮功能收口实测。Windows 系统字体、WebView2 性能及 100+ 本书架仍需主机实机验收。
