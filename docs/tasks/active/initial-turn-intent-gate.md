# 任务：首次白屏加载期间丢弃翻页意图

- 状态：待用户审核
- 创建日期：2026-08-22
- 最后更新：2026-08-22
- 对应 Bug：B-051

## 目标

- 每本书首次白屏/首次 display-ready 前，滚轮、键盘、空格、工具栏翻页等意图全部丢弃，不在首次 ready 后补执行。
- 首次 display-ready 只解锁输入，并清理未达阈值的外层滚轮累计。
- 书籍已经显示过后，跨章 loading 仍保留 TurnIntentBuffer 的最后方向单槽，并在下一次 ready 消费一次。

## 非目标

- 不修改 paginator、显示门布局顺序、CSS 或分页算法。
- 不改变已显示章节期间持续滚轮跨章快进的单槽语义。

## 已确认根因

- `TurnIntentBuffer` 原本无法区分“本书首次 loading”和“已显示过后的跨章 loading”，首次 ready 会消费初次加载期间缓存的方向。

## 实际修改

- `TurnIntentBuffer` 增加本书生命周期 `displayedOnce` 初始门：首次 ready 丢弃 pending；之后 loading 继续缓存最后方向。
- `ReaderView` 首次 display-ready 解锁并 reset 外层滚轮累计；书籍由 `key={bookKey}` 重建时自然重新上锁。
- 增加初始 loading、首次 ready、跨章 loading、reset 后仍保持初始锁的纯逻辑回归。

## 验收标准

- [x] 首次 ready 前多次 request 不产生 pending。
- [x] 首次 ready 后翻页立即放行。
- [x] 首次 ready 后跨章 loading 只保留最后方向并消费一次。
- [x] 首次显示前 reset 不会解锁；首次显示后 reset 保留 displayedOnce，换书由新实例恢复初始锁。

## 本地验证

| 命令/操作 | 结果 | 日期 |
|---|---|---|
| `src/ui/turnIntent.test.ts` | 9/9 通过 | 2026-08-22 |
| 全量 Vitest | 36 文件、334/334 通过 | 2026-08-22 |
| `tsc --noEmit` | 通过 | 2026-08-22 |

## 不应同步的本地文件

- `node_modules/`、`dist/`、Rust target、测试书、截图和浏览器产物。

## 待完成与风险

- Windows WebView2 真实滚轮/键盘事件仍随发布包验收确认；未启动长期浏览器服务。

## 交接说明

后续先阅读本文件、`turnIntent.ts`、`ReaderView.tsx` 和 B-033/B-039 任务；不要把 paginator/CSS 作为本 Bug 的修复范围。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [ ] 用户已审核
- [ ] 用户已同步到真实源仓
- 源仓提交：待用户填写
