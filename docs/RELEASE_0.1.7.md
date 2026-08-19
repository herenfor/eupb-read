# 0.1.7 测试发布说明

- 状态：发布候选，待 Windows 编译、分发和实机验收
- 版本：`0.1.7`
- 日期：2026-08-20
- 源仓比较基线：`v0.1.6` / `e8aabcdeb03543402338aee00fb2e33d52e39841`

## 版本一致性

以下四处必须同时为 `0.1.7`：

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock` 中 `name = "epub-reader"` 的根包版本

不得批量替换 Cargo.lock 中其他依赖恰好相同的版本号。

## 从 WSL 同步到 Windows

在 Windows PowerShell 中执行。该流程先备份旧目录，再移动保留 Windows `node_modules`；旧源码、`dist` 和 Rust `target` 不会混入新版本。

```powershell
$ErrorActionPreference = "Stop"
$src = (wsl.exe wslpath -w /home/herenfor/test/epub-reader).Trim()
$dst = "D:\杂物\eupb-reader"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "D:\杂物\eupb-reader.before-0.1.7-$stamp"

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
      .pw-browsers .pw-libs .pw-libs-debs .cache .toolchain .xwin-cache `
  /XF *.log .img-repro.png
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

成功编译并确认新目录后，再手动删除 `$bak`；在此之前保留它便于回退。不要删除应用自己的 `AppData` 数据，因为本轮需要验证 0.1.6 数据在 0.1.7 中的实际行为。

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

`pnpm tauri build` 会通过 Tauri 的 `beforeBuildCommand` 自动执行前端 `pnpm build`，无需提前重复运行。若希望使用现有一键脚本，也可以执行：

```powershell
.\scripts\build-windows.ps1
```

## 构建产物

- 安装包：`src-tauri\target\release\bundle\nsis\EPUB Reader_0.1.7_x64-setup.exe`
- 免安装版：`src-tauri\target\release\epub-reader.exe`

## 不同步内容

- `node_modules/`：只能保留 Windows 本机版本，不从 WSL 复制。
- `dist/`、`src-tauri/target/`、`src-tauri/target2/`：必须由 Windows 重新生成。
- `.pw-browsers/`、`.pw-libs/`、`.pw-libs-debs/`、`.pnpm-store/`、`.cache/`、`.toolchain/`、`.xwin-cache/`。
- 私有测试 EPUB、截图、日志、临时复现脚本和 AppData 书库数据。

## 发布前检查

隔离副本已完成：Vitest 23 文件 228/228、Vite production build、Rust 10/10、`cargo fmt --check`、`cargo check --locked`，且 Cargo metadata 识别 `epub-reader@0.1.7`。

Windows 专项验收清单见 `docs/tasks/active/version-0.1.7-release-candidate.md`。确认测试版无阻断问题后，再由用户同步真实源仓、提交并创建 `v0.1.7` 标签。
