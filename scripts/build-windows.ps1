# One-click packaging script for Windows (PowerShell)
# Usage: run from project root:  .\scripts\build-windows.ps1
# Version is read from src-tauri\tauri.conf.json (keep package.json /
# tauri.conf.json / Cargo.toml in sync when bumping).
# Output:
#   Installer: src-tauri\target\release\bundle\nsis\EPUB Reader_<version>_x64-setup.exe
#   Portable : src-tauri\target\release\epub-reader.exe
$ErrorActionPreference = "Stop"

Write-Host "== Check toolchain ==" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found: install Node.js >= 20 (https://nodejs.org/)" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw "pnpm not found: run  npm i -g pnpm" }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw "cargo not found: install Rust (https://rustup.rs)" }
$nodeV = (node -v) -replace "^v", ""
if ([int]($nodeV.Split(".")[0]) -lt 20) { throw "Node.js too old ($nodeV), need >= 20" }
Write-Host "  node $(node -v) / pnpm $(pnpm -v) / rustc $(rustc -V)  OK"

Write-Host "== Install dependencies ==" -ForegroundColor Cyan
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

Write-Host "== Frontend build (tsc + vite) ==" -ForegroundColor Cyan
pnpm build
if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }

Write-Host "== Tauri bundle (first run downloads and compiles Rust deps, 5-15 min) ==" -ForegroundColor Cyan
pnpm tauri build
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed (common causes: missing WebView2 / network issues; see README)" }

Write-Host ""
Write-Host "== Done ==" -ForegroundColor Green
# tauri.conf.json is UTF-8 (no BOM): read it as UTF-8 explicitly,
# otherwise Windows PowerShell 5.1 decodes it as ANSI/GBK and the
# Chinese window title breaks JSON parsing.
$version = (Get-Content -Raw -Encoding UTF8 "src-tauri\tauri.conf.json" | ConvertFrom-Json).version
$nsis = "src-tauri\target\release\bundle\nsis\EPUB Reader_${version}_x64-setup.exe"
$portable = "src-tauri\target\release\epub-reader.exe"
if (Test-Path $nsis) { Write-Host "  Installer: $(Resolve-Path $nsis)" -ForegroundColor Green }
if (Test-Path $portable) { Write-Host "  Portable : $(Resolve-Path $portable)" -ForegroundColor Green }
Write-Host ""
Write-Host "Note: target machines need the WebView2 Runtime (built into Win10/11; if missing,"
Write-Host "install the evergreen version from https://developer.microsoft.com/microsoft-edge/webview2/)."
