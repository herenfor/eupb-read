# B-060/C-49：正文笔记首版

- 状态：代码、自动化与 WSL Chromium 回归完成，待用户及 Windows WebView2 审核。
- 目标：在可重排正文中选中文本，通过自定义右键菜单添加笔记；提供按时间倒序的本书笔记页、编辑、删除、原文跳转和既有三步撤销/前进。
- 锚点：保存章节 spine/path、Unicode code-point 起止 offset、首尾各不超过 32 字符的片段和选中文字。章节内容轻微漂移时在原位置附近解析；不能可靠解析时不猜测。
- 渲染：使用 iframe 内 CSS Custom Highlight API 的 `reader-notes` 下划线，不包裹或修改 EPUB DOM，不参与测量、分页和阅读进度。没有 API 的内核只是不显示下划线，笔记数据和列表仍保留。
- 存储：笔记属于书架记录，进入无设备路径的 portable archive；同 ID 合并采用较新的 `updatedAtMs`。选择上限 4096 code points，笔记内容上限 10000；前端和 Rust 同时校验。
- 性能：不预扫描整书；只解析和高亮当前章节笔记。列表初始渲染最近 200 条，可分批显示全部记录。
- 验证：前端 Vitest 50 files/393 tests、TypeScript、Vite production build（110 modules）；Rust fmt 与 18/18 tests。WSL Chromium 900×650 实测选区→添加→下划线→列表→跳转，保存前后章节 scrollWidth 均为 900，Highlight size=1，原生选区已清除，跳转后后退可用。5173 已释放。
- 待确认：Windows WebView2 的右键、剪贴板、CSS Highlight 颜色与大量笔记列表观感。
