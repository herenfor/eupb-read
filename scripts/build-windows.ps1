# 阶段性打包脚本（Windows PowerShell）
# 用法：在项目根目录执行  .\scripts\build-windows.ps1
# 产出：
#   安装包: src-tauri\target\release\bundle\nsis\EPUB Reader_0.1.0_x64-setup.exe
#   免安装: src-tauri\target\release\epub-reader.exe
$ErrorActionPreference = "Stop"

Write-Host "== 检查工具链 ==" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "未找到 node：请先安装 Node.js ≥ 20（https://nodejs.org/）" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw "未找到 pnpm：请执行 npm i -g pnpm" }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw "未找到 cargo：请安装 Rust（https://rustup.rs）" }
$nodeV = (node -v) -replace "^v", ""
if ([int]($nodeV.Split(".")[0]) -lt 20) { throw "Node.js 版本过低（$nodeV），需要 ≥ 20" }
Write-Host "  node $(node -v) / pnpm $(pnpm -v) / rustc $(rustc -V)  ✓"

Write-Host "== 安装依赖 ==" -ForegroundColor Cyan
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败" }

Write-Host "== 前端构建（tsc + vite） ==" -ForegroundColor Cyan
pnpm build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }

Write-Host "== Tauri 打包（首次需下载并编译 Rust 依赖，耗时 5-15 分钟） ==" -ForegroundColor Cyan
pnpm tauri build
if ($LASTEXITCODE -ne 0) { throw "Tauri 打包失败（常见原因：WebView2 缺失/网络问题，见 README）" }

Write-Host ""
Write-Host "== 打包完成 ==" -ForegroundColor Green
$nsis = "src-tauri\target\release\bundle\nsis\EPUB Reader_0.1.0_x64-setup.exe"
$portable = "src-tauri\target\release\epub-reader.exe"
if (Test-Path $nsis) { Write-Host "  安装包 : $(Resolve-Path $nsis)" -ForegroundColor Green }
if (Test-Path $portable) { Write-Host "  免安装: $(Resolve-Path $portable)" -ForegroundColor Green }
Write-Host ""
Write-Host "分发注意：目标电脑需要 WebView2 Runtime（Win10/11 自带；缺失时"
Write-Host "https://developer.microsoft.com/microsoft-edge/webview2/ 安装常青版）。"
