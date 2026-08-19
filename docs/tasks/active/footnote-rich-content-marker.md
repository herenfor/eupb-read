# B-035：图片脚注弹层泄漏注释序号

- 状态：代码与自动化回归完成，待用户审核
- 版本：0.1.7
- 发现日期：2026-08-20

## 现象与根因

`[简][初鹿野創].有谁规定了在现实中不能有恋爱喜剧的？.03.epub` 的 `Postscript.xhtml` 使用多看图片脚注结构：

```html
<aside epub:type="footnote" id="note019">
  <a href="#note_ref019">
    <ol class="duokan-footnote-content">
      <li class="duokan-footnote-item" value="019">…图片…</li>
    </ol>
  </a>
</aside>
```

正文 iframe 继承了书籍 `aside ol { list-style:none !important; }`，没有显示编号。图片脚注被 `resolveFootnote()` 作为富 HTML 复制到应用 UI 的 `.footnote-html` 后，不再继承书籍样式；宿主 CSS 的通用 `padding-left:20px` 又让浏览器默认绘制 `li[value="019"]` 的有序列表 marker。

## 选择的方案

- 只在宿主 UI 匹配 `.footnote-html ol.duokan-footnote-content` 和其直接 `li`，隐藏 marker 并将列表左 padding 设为 0。
- 该结构直接 `li > div > img` 的图片容器覆盖通用 `margin-left:-20px`，使图片回到弹层内容边缘；嵌套作者列表不命中该覆盖。
- 普通 `.footnote-html ol/ul` 不改变，继续保留作者列表编号和图片缩进。
- 不在 `footnotes.ts` 删除或 unwrap 节点，不修改正文 iframe CSS，不按书名或注释数字特判。

## 验收记录

- [x] CSS 契约回归：`src/ui/footnoteStyles.test.ts` 2/2，验证多看脚注定向规则和普通列表保护。
- [x] WSL Chromium：点击 `Postscript.xhtml` 两个图片脚注，`019`/`020` 的 computed `list-style-type` 均为 `none`、padding 为 `0px`，图片、列表项与内容左缘一致，弹层不再显示序号。
- [ ] Windows WebView2：确认宿主 CSS 与 Chromium 一致。
- [x] 全量 Vitest：23 个文件、228/228；`tsc --noEmit`；Vite production build。

## 交接注意

不要把修复扩大为全局 `.footnote-html ol { list-style:none }`；普通脚注可能包含作者有序列表。后续遇到其他厂商脚注结构，应先确认编号是否由宿主 CSS 重新生成，再增加结构判据。

## 源仓同步状态

- [x] 已更新 `docs/SOURCE_DELTA.md`
- [x] 已更新 `docs/BUGFIX_LOG.md`
- [x] 已更新 `docs/MODULE_CONTRACTS.md` 与 `docs/rendering-layers.md`
- [ ] 用户审核后由用户同步到真实源仓
