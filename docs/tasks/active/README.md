# 活动任务目录

这里仅存放尚未结束、需要跨对话继续的任务记录。

- 从 `../TEMPLATE.md` 复制一份并使用稳定名称，例如 `chapter-preload.md`。
- 同一目标只保留一个活动文件，新对话在原文件上继续更新。
- 任务完成并经用户审核后，可以移动到 `docs/tasks/archive/`；是否同步由用户决定。
- 一次性调试输出、测试书、截图和聊天转录不要放入本目录。
- 当前待确认或待同步的任务以本目录中的任务文件为准；已经同步但仍缺 Windows 证据的版本任务也可暂留在这里。

## 当前阶段

- 待 Windows 实机确认：[`desktop-single-instance.md`](./desktop-single-instance.md)（B-032）。Tauri 桌面版已接入官方单实例插件；第二次启动恢复并聚焦已有主窗口，浏览器开发模式不变。Rust 10/10、格式与检查通过。
- 待用户审核：[`reader-navigation-history-forward.md`](./reader-navigation-history-forward.md)（B-033）。阅读历史为最多 3 条的 back/forward 双栈；初始加载可以已保存基线记录首次跳转，同章 fragment 可连续入栈，最终 display-ready 后才写稳定进度。
- 待用户审核：[`toc-top-float-containment.md`](./toc-top-float-containment.md)（B-034）。目录顶层无作者水平 margin 的 float 在宽视口回到居中的 40rem 版心边缘；作者 margin、全页/全宽意图、过宽盒保守跳过，640px 窄容器保持自然布局。
- 待用户审核：[`footnote-rich-content-marker.md`](./footnote-rich-content-marker.md)（B-035）。多看图片脚注复制到宿主弹层后不再继承书籍 `list-style:none`，现在仅隐藏该结构的生成编号并恢复图片左缘；普通作者列表保持编号。
- 待 Windows 发布包验证：[`linked-library-refactor.md`](./linked-library-refactor.md)（B-031）。桌面书库已改为引用源 EPUB；可同步状态、设备路径和 100 MiB 有界缩略图缓存已分层，旧测试书库不迁移。自动化为前端 21 文件 218/218、Rust 9/9、TypeScript/Vite 与 Cargo 检查通过。
- 当前隔离副本版本：`0.1.7` 测试发布候选；真实源仓 `main`/`origin/main` 仍以 `e8aabcd`（`v0.1.6`）为比较基线。
- 当前收尾记录：[`version-0.1.7-release-candidate.md`](./version-0.1.7-release-candidate.md) 与 `../../RELEASE_0.1.7.md`；Windows 安装包尚待用户编译、分发与实机确认。
- 已同步任务：B-020/B-021 导入与进度、自定义字体/CSS/全选、阅读跳转历史、书签、B-022。
- 待用户审核、尚未同步：[`toc-percent-margin-resilience.md`](./toc-percent-margin-resilience.md)（B-023）。B-022 的 CSSOM 扫描已改记为部分修复，后续以 B-023 的 Typed OM/安全回退方案为准。
- 待用户审核、尚未同步：[`toc-symmetric-margin-regression.md`](./toc-symmetric-margin-regression.md)（B-024）。C-18 的正对称 margin 豁免已收窄到具有 fit/max-content 原始意图的盒，普通目录标题恢复 C-04。
- 待用户审核、尚未同步：[`toc-inline-box-overflow.md`](./toc-inline-box-overflow.md)（B-025）。目标书 right 对齐目录的可见 inline 色块尾随全角空白越过父段落，已加入几何门控的 inline-block 原子化补偿。
- 待用户审核、尚未同步：[`reader-history-internal-links.md`](./reader-history-internal-links.md)（B-026）。修复 iframe 书内链接旧闭包导致历史不入栈，并为同章 fragment 增加可撤销通知；目录/书签/内部链接拆分为单次记录与纯跳转。
- 待用户审核、尚未同步：[`custom-css-commit-and-theme-bgcolor.md`](./custom-css-commit-and-theme-bgcolor.md)（B-027）。自定义 CSS 改为显式保存，浅色安全 bgcolor 合入默认背景层并保留用户背景图；多个 CSS 预设仍是 optional backlog（schema/UI CRUD/旧值迁移）。
- 待用户审核、尚未同步：[`toolbar-narrow-layout.md`](./toolbar-narrow-layout.md)（B-028）。工具栏左右列按实际控件宽度布局，窄屏标题单行省略，已完成 1080/640 视口与 UI scale 1/1.3 验证。
- 待用户审核、尚未同步：[`css-comment-boundaries.md`](./css-comment-boundaries.md)（B-029）。CSS 注释边界保护已完成自动化与 Chromium 外链 CSS 端到端验证；普通测试书回归与 Windows WebView2 确认仍按发布流程进行。
- 待用户审核、尚未同步：[`trailing-media-float-overflow.md`](./trailing-media-float-overflow.md)（B-030）。末尾递归媒体-only float 的跨列溢出已加入 `scrollHeight` 推算、后代视觉 rect 与碰撞门控；目标书 900×650/1280×800 及四本相邻实书 Chromium 回归完成。
- 上述任务暂留在活动目录保存 Windows 确认证据；确认发布后统一移动到 `../archive/`。
- 0.1.7 测试版范围已经冻结；编译前只接受阻断发布的问题，不从旧路线图自动扩大范围。
