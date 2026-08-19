# B-027：自定义 CSS 显式提交与浅色主题 bgcolor 层级

- 状态：已实现，待用户审核/同步
- 发现日期：2026-08-18
- 版本：0.1.7

## 目标与范围

自定义 CSS 输入不应在每个字符变化时重载当前章节；用户应明确点击“保存并应用”后才提交。书籍的安全 `body bgcolor` 在浅色主题下作为默认背景色参与阅读器覆盖层，深色/纸色主题忽略它；背景图不能被覆盖规则清除。

## 实现

- `MenuPanel` 使用本地草稿状态，输入只更新 textarea；“保存并应用”按钮仅在草稿与已保存值不同的时候可用，支持清空后保存。组件重新挂载从已保存值初始化，父值外部变化（恢复默认等）同步草稿；关闭菜单不会隐式提交。
- `sanitizeChapter` 只接受安全的十六进制/颜色名 `bgcolor`，浅色主题把它传入同一个 override style 的 `body { background-color: ... }` 默认声明；用户 CSS 位于同一 style 的最后。读取后移除 `bgcolor` 属性以消费重复的 legacy 来源（旧实现曾将独立 `!important` 规则追加在 userCss 之后）；不改动背景图。深色/纸色不注入书籍颜色。
- 本轮不实现多个 CSS 预设。后续可选项需要 presets schema、UI CRUD 与旧 `customCss` 迁移，不能把现有单字符串设置误当作已支持多预设。

## 验收

- Vitest：17 个文件、186/186；`tsc --noEmit`、Vite production build 通过。
- Chromium：选择器书连续输入 5 个字符期间 iframe load 计数保持 0；保存一次增加 1，清空保存再次增加 1，清空后草稿 style 消失。
- Chromium 合成/无作者 `!important` 的章节：浅色 `bgcolor` + 普通用户 `body { background-color:#123456; background-image:... }` 的 computed background 为 `rgb(18, 52, 86)`，背景图保留；清空用户 CSS 后深色/纸色分别为主题色 `rgb(30, 30, 30)` / `rgb(244, 236, 216)`。
- 真实测试书中若作者 CSS 使用 `background-color: !important`，该作者规则仍按 CSS 优先级生效；这不作为普通用户 CSS 覆盖能力的回归样本。

## 修改文件

`src/ui/MenuPanel.tsx`、`src/ui/menuPanel.test.ts`、`src/render/sanitize.ts`、`src/render/sanitize.test.ts`，以及本任务引用的项目文档。

## 后续

用户审核后同步到真实源仓；Windows WebView2/安装包仍需用户最终确认。多个 CSS 预设保持 optional backlog。
