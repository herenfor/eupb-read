# 0.1.8 测试发布说明

- 状态：发布候选，待 Windows 编译、分发和实机验收
- 版本：`0.1.8`
- 日期：2026-08-21
- 源仓比较基线：`v0.1.6` / `e8aabcdeb03543402338aee00fb2e33d52e39841`

## 版本一致性

以下四处必须同时为 `0.1.8`：

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock` 中 `name = "epub-reader"` 的根包版本

不得批量替换 Cargo.lock 中其他依赖恰好相同的版本号。

## 从 WSL 同步到 Windows

在 Windows PowerShell 中执行。该流程先把旧目录改名备份，再迁移 Windows 已安装的 `node_modules`，最后从 WSL 复制干净源码；旧源码和旧构建产物不会混入新版本。

```powershell
$ErrorActionPreference = "Stop"
$src = (wsl.exe wslpath -w /home/herenfor/test/epub-reader).Trim()
$dst = "D:\杂物\eupb-reader"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "D:\杂物\eupb-reader.before-0.1.8-$stamp"

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

若 `wslpath` 没有返回 UNC 路径，先运行 `wsl.exe -l -q` 查看发行版名称，再把 `$src` 手工设为类似：

```powershell
$src = "\\wsl.localhost\Ubuntu\home\herenfor\test\epub-reader"
```

成功编译并确认新目录后，再手动删除 `$bak`；在此之前保留它便于回退。不要清理应用自己的 AppData 数据，否则无法验证旧版本书库和进度在 0.1.8 中的兼容行为。

## Windows 编译

继续在 Windows PowerShell 的项目目录执行：

```powershell
node -v
pnpm -v
rustc -V
cargo -V

pnpm install --frozen-lockfile
pnpm test
pnpm tauri build
```

`pnpm tauri build` 会通过 Tauri 的 `beforeBuildCommand` 自动执行前端 `pnpm build`，无需提前重复运行。也可以使用现有一键脚本：

```powershell
.\scripts\build-windows.ps1
```

一键脚本会自行运行依赖检查、前端构建和 Tauri 打包；它不会运行 Vitest，所以发布前仍建议先执行一次 `pnpm test`。

## 构建产物

- 安装包：`src-tauri\target\release\bundle\nsis\EPUB Reader_0.1.8_x64-setup.exe`
- 免安装版：`src-tauri\target\release\epub-reader.exe`

## 不同步内容

- `node_modules/`：只保留 Windows 本机版本，不从 WSL 复制。
- `dist/`、`src-tauri/target/`、`src-tauri/target2/`、`src-tauri/gen/`：由 Windows 重新生成。
- `.pw-browsers/`、`.pw-libs/`、`.pw-libs-debs/`、`.pnpm-store/`、`.cache/`、`.toolchain/`、`.xwin-cache/`。
- 私有测试 EPUB、截图、日志、临时复现脚本和 AppData 书库数据。

## 发布前检查

隔离副本发布收口复验为：Vitest 35 文件 319/319、`tsc --noEmit`、Vite production build（96 modules）、`cargo fmt --check`、Rust 13/13 与 `cargo check --locked` 均通过；Cargo metadata 识别 `epub-reader@0.1.8`。B-049 另完成 WSL Chromium 真实点击和阅读器重载计数验证。

Windows 专项验收清单也在该任务文件中。确认测试版无阻断问题后，再由用户同步真实源仓、提交并创建 `v0.1.8` 标签。
