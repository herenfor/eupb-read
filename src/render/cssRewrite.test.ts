import { describe, expect, it } from "vitest";
import { rewriteCssUrls } from "./cssRewrite";

describe("rewriteCssUrls", () => {
  const urlFor = (p: string): string | undefined => `blob:test/${p}`;

  it("改写相对 url() 三种写法", () => {
    const css = `body { background: url('bg.png'); }
div { border-image: url("b.png"); }
a { cursor: url(arrow.cur), auto; }`;
    const out = rewriteCssUrls(css, "OEBPS/css/main.css", urlFor);
    expect(out).toContain('url("blob:test/OEBPS/css/bg.png")');
    expect(out).toContain('url("blob:test/OEBPS/css/b.png")');
    expect(out).toContain('url("blob:test/OEBPS/css/arrow.cur")');
  });

  it("正确处理 ../ 相对路径", () => {
    const out = rewriteCssUrls("p { background: url(../img/x.png) }", "OEBPS/css/main.css", urlFor);
    expect(out).toContain("blob:test/OEBPS/img/x.png");
  });

  it("外部与 data: 引用保持不变", () => {
    const css = `a { background: url(https://x.com/a.png) }
b { background: url(data:image/png;base64,AAA=) }`;
    const out = rewriteCssUrls(css, "OEBPS/css/main.css", urlFor);
    expect(out).toContain("https://x.com/a.png");
    expect(out).toContain("data:image/png;base64,AAA=");
  });

  it("缺失资源保持原样", () => {
    const out = rewriteCssUrls("p { background: url(missing.png) }", "OEBPS/css/main.css", () => undefined);
    expect(out).toContain("url(missing.png)");
  });

  it("@font-face 的 src url 被改写（字体核心路径）", () => {
    const css = `@font-face { font-family: "Body"; src: url("../fonts/body.otf"); }`;
    const out = rewriteCssUrls(css, "OEBPS/css/main.css", urlFor);
    expect(out).toContain('url("blob:test/OEBPS/fonts/body.otf")');
  });

  it("@import 裸字符串与 url() 形式均被改写（含媒体后缀）", () => {
    const css = `@import "default.css";
@import url('sub/base.css') screen and (min-width: 600px);`;
    const out = rewriteCssUrls(css, "OEBPS/Styles/stylesheet.css", urlFor);
    expect(out).toContain('@import url("blob:test/OEBPS/Styles/default.css");');
    expect(out).toContain(
      '@import url("blob:test/OEBPS/Styles/sub/base.css") screen and (min-width: 600px);'
    );
    // 已改写的 blob import 不会被二次处理（幂等）
    const twice = rewriteCssUrls(out, "OEBPS/Styles/stylesheet.css", urlFor);
    expect(twice).toBe(out);
  });

  it("width:% 换算为版心宽度（40em 的对应比例）", () => {
    const css = `.paper { width: 90%; padding: 1em; }
.panel { width:100%; }
@media screen { .note { width: 50%; } }`;
    const out = rewriteCssUrls(css, "OEBPS/Styles/main.css", urlFor);
    expect(out).toContain(".paper { width: 36em;");
    expect(out).toContain(".panel { width: 40em;");
    expect(out).toContain(".note { width: 20em;");
  });

  it("全页图块 / img / body 选择器的 width:% 不换算", () => {
    const css = `.illus { width: 100%; }
img { width: 100%; height: auto; }
body { width: 90%; }
.duokan-image-single img { width: 100%; }`;
    const out = rewriteCssUrls(css, "OEBPS/Styles/main.css", urlFor);
    expect(out).toContain(".illus { width: 100%; }");
    expect(out).toContain("img { width: 100%; height: auto; }");
    expect(out).toContain("body { width: 90%; }");
    expect(out).toContain(".duokan-image-single img { width: 100%; }");
  });

  it("@import 链被递归内联：被导入 CSS 的 width:% 与 url() 都按其自身路径改写", () => {
    const getText = (p: string): string | undefined => {
      if (p === "OEBPS/Styles/default.css") {
        return `.paper { width: 90%; background: url(../Images/bg.png); }
@font-face { font-family: x; src: url(../Fonts/x.ttf); }`;
      }
      return undefined;
    };
    const out = rewriteCssUrls(
      `@import "default.css";`,
      "OEBPS/Styles/stylesheet.css",
      urlFor,
      { getText }
    );
    expect(out).toContain("@import default.css → 内联");
    expect(out).toContain(".paper { width: 36em;");
    expect(out).toContain('url("blob:test/OEBPS/Images/bg.png")');
    expect(out).toContain('url("blob:test/OEBPS/Fonts/x.ttf")');
    // 不再残留 @import blob（内容已内联）
    expect(out).not.toContain("@import url(");
  });

  it("@import 内联保留媒体条件", () => {
    const getText = (p: string): string | undefined =>
      p === "OEBPS/Styles/print.css" ? `.paper { width: 50%; }` : undefined;
    const out = rewriteCssUrls(
      `@import "print.css" print;`,
      "OEBPS/Styles/main.css",
      urlFor,
      { getText }
    );
    expect(out).toContain("@media print {");
    expect(out).toContain(".paper { width: 20em; }");
  });

  it("循环 @import 只内联一次并跳过后续", () => {
    const css = `@import "a.css";`;
    const getText = (p: string): string | undefined => {
      if (p === "OEBPS/Styles/a.css") return `@import "b.css";`;
      if (p === "OEBPS/Styles/b.css") return `@import "a.css"; .x { width: 90%; }`;
      return undefined;
    };
    const out = rewriteCssUrls(css, "OEBPS/Styles/main.css", urlFor, { getText });
    expect(out).toContain("循环 @import 已跳过：a.css");
    expect(out).toContain(".x { width: 36em; }");
  });
});
