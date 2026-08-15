import { describe, expect, it } from "vitest";
import { parseNav, isUsableHref } from "./nav";
import { parseXmlText } from "./parseXml";

const wrap = (body: string) =>
  `<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`;

describe("isUsableHref", () => {
  it("书内相对路径可用", () => {
    expect(isUsableHref("a.xhtml")).toBe(true);
    expect(isUsableHref("../Text/ch1.xhtml#sec")).toBe(true);
  });
  it("前端式无效链接判定为不可用", () => {
    expect(isUsableHref("javascript:void(0)")).toBe(false);
    expect(isUsableHref("https://example.com")).toBe(false);
    expect(isUsableHref("mailto:a@b.c")).toBe(false);
    expect(isUsableHref("#sec")).toBe(false);
    expect(isUsableHref("")).toBe(false);
  });
});

describe("parseNav: 前端式目录（div 布局）", () => {
  it("relative 块包 absolute 块（无 ol/li）按 a 提取", async () => {
    const doc = await parseXmlText(
      wrap(`
<nav epub:type="toc">
  <div class="relative" style="position:relative">
    <div class="absolute" style="position:absolute"><a href="a.xhtml">第一章</a></div>
    <div class="absolute" style="position:absolute"><a href="b.xhtml">第二章</a></div>
  </div>
</nav>`),
      "text/html"
    );
    const toc = parseNav(doc.documentElement);
    expect(toc.map((t) => t.label)).toEqual(["第一章", "第二章"]);
    expect(toc[0].href).toBe("a.xhtml");
  });

  it("嵌套 div 深度重建层级", async () => {
    const doc = await parseXmlText(
      wrap(`
<nav epub:type="toc">
  <div>
    <div><a href="a.xhtml">第一章</a></div>
    <div>
      <a href="b.xhtml">第二章</a>
      <div><a href="b1.xhtml">第二节</a></div>
    </div>
  </div>
</nav>`),
      "text/html"
    );
    const toc = parseNav(doc.documentElement);
    expect(toc.map((t) => t.label)).toEqual(["第一章", "第二章"]);
    expect(toc[1].children.map((c) => c.label)).toEqual(["第二节"]);
  });

  it("a 无文字（图标链接）的条目被跳过", async () => {
    const doc = await parseXmlText(
      wrap(`
<nav epub:type="toc">
  <div>
    <div><a href="a.xhtml">第一章</a></div>
    <div><a href="b.xhtml"></a></div>
  </div>
</nav>`),
      "text/html"
    );
    const toc = parseNav(doc.documentElement);
    expect(toc.map((t) => t.label)).toEqual(["第一章"]);
  });
});

describe("parseNav: 标准结构容错", () => {
  it("li 内 a 被 div 包裹也能解析", async () => {
    const doc = await parseXmlText(
      wrap(`
<nav epub:type="toc">
  <ol>
    <li><div class="wrap"><a href="x.xhtml">被包裹的标签</a></div></li>
  </ol>
</nav>`),
      "text/html"
    );
    const toc = parseNav(doc.documentElement);
    expect(toc[0].label).toBe("被包裹的标签");
    expect(toc[0].href).toBe("x.xhtml");
  });

  it("标准 ol/li/a 结构优先于兜底", async () => {
    const doc = await parseXmlText(
      wrap(`
<nav epub:type="toc">
  <ol>
    <li><a href="a.xhtml">甲</a></li>
    <li><a href="b.xhtml">乙</a></li>
  </ol>
</nav>`),
      "text/html"
    );
    const toc = parseNav(doc.documentElement);
    expect(toc.map((t) => t.label)).toEqual(["甲", "乙"]);
  });
});
