# 任务：设置数值步进边界与阅读器重载

- 状态：代码、自动化与 WSL Chromium UI 验证完成，待用户/Windows WebView2 审核
- 创建日期：2026-08-21
- 最后更新：2026-08-21
- 对应 Bug：B-049

## 目标

详细设置的 +/- 控件按可见数值相邻档位变化；到达最小/最大值后继续同方向点击保持不变，不回到默认值；真实变化才触发设置 identity 更新与阅读器重排。

## 非目标

- 不修复 WebView2 字形空心化问题；该问题继续作为独立兼容性风险处理。
- 不改变 150ms 设置重载 debounce、阅读锚点恢复或分页算法。
- 不修改 Rust、测试书或真实源仓。

## 当前现象与证据

- 详细设置的步进列表把 `undefined` 自动档放在数值档位首位；到达最小/最大值后继续点击会环绕到自动档。
- `undefined` 在界面上分别显示为行高 1.6、字重 400、字/词间距 0；因此步进必须以这些可见值为当前位置。
- 旧边界 updater 总是创建新 settings 对象，即使数值被 clamp 到原值，也会触发无效重载。

## 已确认根因

App 中的 `stepValue` 使用模运算循环列表，并把 `undefined` 作为首档；边界点击因此回到自动值。字号和详细项的 setter 也没有在值未变化时返回原 settings 对象。

## 必须保持的行为

- 纯数值档位按升序处理；有效变化返回新 settings 对象，沿用 ReaderView 现有 150ms debounce reload。
- 边界 no-op 返回原 settings 对象，不产生持久化 identity 变化或 paginator reload。
- `undefined` 自动档按可见默认值参与一次 +/- 计算；若候选仍等于可见默认值，则保留 `undefined`。
- 滑杆 direct change 继续 clamp 到各自范围。

## 实际修改

- `src/ui/settingsStepper.ts`：新增按可见默认值计算的纯数值步进 helper，支持中间非档位值与边界 clamp。
- `src/ui/settingsStepper.test.ts`：覆盖自动档相邻变化、0 间距自动档 no-op、数值边界和中间值选择。
- `src/App.tsx`：行高/字重/字间距/字符间距使用纯数值档位；边界 updater 返回原 settings；字号和 direct slider setter 也避免边界无效更新并 clamp。

## 验收标准

- [x] 详细设置数值边界不环绕、不回默认。
- [x] 自动档按界面可见默认值相邻步进。
- [x] 边界 no-op 不创建新 settings identity。
- [x] 范围内变化沿用现有 debounce 触发阅读器重载。
- [x] 自动化测试与 TypeScript/build 通过。
- [x] 真实 Chromium UI：范围内变化触发 iframe reload/ready，数值边界继续点击保持值和 reload 计数不变。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| 旧 helper 下新增回归 | 4 项中 3 项失败，确认回归有效 | 2026-08-21 |
| `pnpm exec vitest run src/ui/settingsStepper.test.ts src/ui/menuPanel.test.ts src/ui/settingsReload.test.ts` | 7/7 通过 | 2026-08-21 |
| `pnpm test` | 35 个测试文件、319/319 通过 | 2026-08-21 |
| `tsc --noEmit` | 通过 | 2026-08-21 |
| `pnpm build` | Vite 96 modules 构建通过 | 2026-08-21 |
| 本地 Chromium UI | 浏览器插件因 `sandboxCwd` 元数据错误不可用后，按降级规则复用 WSL Playwright/Chromium：行高自动 1.6 点 `+` 到 1.8，iframe load `0→1`；到 2.2 后额外 `+` 保持 2.2、load 保持 3；到 1.4 后额外 `-` 保持 1.4、load 保持 7；字间距自动 0 额外 `-` 保持 0/load 7，点 `+` 到 2/load `7→8` | 2026-08-21 |
| Vite/Chromium 清理 | 已停止 Vite；5173/5174 均未监听 | 2026-08-21 |

## 不应同步的本地文件

- 一次性验证脚本仅位于 `/tmp` 且验证后删除；浏览器缓存、构建产物和测试书不属于同步内容。

## 待完成与风险

- Windows WebView2 仍需发布包实机确认；WSL Chromium 已覆盖真实点击、reload 与边界 no-op。B-049 不处理独立的字形空心化问题。

## 交接说明

下一步由用户在 Windows 发布包复核详细设置的边界手感；若有平台差异，沿用本任务的 iframe reload 计数契约定位。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
