# 任务：阅读跳转历史前进/后退与稳定恢复（B-033）

- 状态：代码与自动化回归完成，待用户审核
- 创建日期：2026-08-20
- 范围：阅读器显式导航历史、display-ready 稳定边界与首次跳转/进度恢复竞态

## 目标

- 目录、有效书内链接和书签跳转各记录一次当前位置；外链、脚注和无效目标不记录。
- 后退/前进各使用独立栈，单栈最多保留 3 条；新的普通跳转清空前进栈。
- 初次打开、换章、历史恢复都等待 paginator 最终显示门解除后再视为稳定位置。
- 有内容锚点时只使用锚点；仅在锚点为空时使用页码兜底。
- 转场期间历史按钮禁用，并以后退/前进共用一个圆角胶囊呈现。

## 修改范围

- `src/ui/readerNavigationHistory.ts` 及纯逻辑测试：bounded back/forward 状态机。
- `src/App.tsx`：同步 ready ref、稳定位置基线、transition gate、前进/后退编排。
- `src/ui/ReaderView.tsx`：latest-ref 转发 display-ready 与同章 settled 回调。
- `src/render/paginator.ts`：同章 fragment 定位完成后发出轻量 settled 通知，允许连续锚点跳转逐次入栈。
- `src/ui/Toolbar.tsx`、`src/styles.css`：同胶囊前进/后退按钮；以子控件 intrinsic width 重测动态侧轨，避免旧宽度下按钮点击区重叠。

## 验收

- 4 次显式跳转后 back 栈长度不超过 3。
- 后退后前进能对称恢复章节、页码和锚点。
- 首次可交互点击不会因 React ready state 尚未 commit 而漏记。
- 初始/历史 anchor 不被旧 page 覆盖。
- 定向 31/31、全量 Vitest 22 文件 221/221、TypeScript、Vite build 通过。WSL Chromium 确认初始目录跳转、连续 fragment、后退/前进及胶囊点击布局；Windows WebView2 人工验证另行进行。
