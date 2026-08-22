# B-058/C-47：Windows 系统字体与独立字体中心

- 状态：前端代码、自动化和 WSL Chromium 验收完成；待 Windows 主机 `cargo check`/`tauri build` 与实机系统字体枚举确认。
- 对应 Bug/能力：B-058（字体选择与导入性能）、C-47（系统字体 + 独立字体中心）。编号核对：未发现既有 B-058 或 C-47 登记。
- 范围：当前实现 Windows 桌面路径；Android 仅预留接口，暂不实现系统字体枚举。

## 行为契约

- Tauri 后端 `system_fonts_list` 使用 DirectWrite 返回 `family` 与 `localizedNames`，不返回系统字体路径、不读取字体文件；非 Windows 返回空列表。
- 系统字体只在用户首次打开字体中心时枚举，并在本次会话缓存结果；持久化的 system family 在枚举失败或暂不可用时保留设置，界面标记“当前设备不可用”，不后台清空偏好。
- 导入字体启动时只 `list()` 元数据；只有当前选中的 imported `customFontId` 才异步 `readFont` 并创建一个 Blob URL。读取竞态不能让旧结果覆盖新选择；新字体 URL 创建成功后才释放旧 URL，读取失败保留旧 URL。
- 设置与 portable archive 保存 `fontSource: "system" | "imported"`、`customFontId` 和兼容的 `customFontName`；跟随书籍时清空来源、id、name。旧版仅有 `customFontName` 时尽量绑定已有导入字体。
- 字体中心是独立面板，提供跟随书籍、系统字体/已导入字体 tabs、搜索、导入、删除、loading/error/empty 状态。列表使用固定行高虚拟窗口与顶部/底部 spacer，可滚动到大列表末尾；每行不默认用自身字体渲染。
- 面板 z-index 为 42，菜单 backdrop 为 41；关闭字体中心、菜单或 backdrop 均不得留下不可达面板状态。

## 验证

- Root 独立前端验证：全量 Vitest 44 files/365 tests、`tsc --noEmit`、Vite build 104 modules。
- WSL Chromium 900×650 模拟 300 个 imported：启动 binary `get`=0（React dev StrictMode metadata `getAll`=2）；滚动末尾 DOM rows=9、末项 `Font299`；选择后 binary `get`=1；panel z=42、backdrop z=41、`hitInside=true`；设置 `source=imported`、id=`012b`。
- 最终动态视口补测（900×900）：字体列表实测高度 292px，末尾仅挂载 13 行且可到 `Font299`；搜索 `Font001` 后 DOM `scrollTop` 正确归零并仅显示匹配项。该补丁后定向字体/sanitize 4 文件 63/63、`tsc --noEmit` 与 Vite 104 modules 再次通过。
- UI 复核修正：独立的“跟随书籍”按钮不再继承纵向面板中的 `flex: 1`，恢复为全宽 36px 行；仅导入字体行内的名称按钮横向伸展。字体面板定向 2/2 与 `tsc --noEmit` 通过。
- 5173/5174 无监听；临时脚本和测试数据未进入项目。

## 风险与待办

- 当前 Linux 环境不代表 Windows target。已核对 windows-rs 生成签名并修复 `GetSystemFontCollection` 输出参数，但必须在 Windows 主机执行 `cargo check`、`tauri build` 并进行真实系统字体枚举。
- 真实大量系统字体、本地化 family 名称进入 CSS 的兼容性仍待 Windows WebView2 实测；CSS family 字符串已转义反斜杠、引号和 CR/LF/form-feed。
- Android 仅保留前端接口空间，未实现 Android 系统字体列表。
