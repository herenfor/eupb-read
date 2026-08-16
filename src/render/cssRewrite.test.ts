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

  it("width:% 改写为 min(书百分比, 版心比例)（窄容器由浏览器取书自己的 %）", () => {
    const css = `.paper { width: 90%; padding: 1em; }
.panel { width:100%; }
@media screen { .note { width: 50%; } }
.toc-link { width:100%; }`;
    const out = rewriteCssUrls(css, "OEBPS/Styles/main.css", urlFor);
    expect(out).toContain(".paper { width: min(90%, 36rem);");
    expect(out).toContain(".panel { width: min(100%, 40rem);");
    expect(out).toContain(".note { width: min(50%, 20rem);");
    // 命定之人目录：.toc-link 的 100% 相对 53px 的 td，
    // min 让它保持 td 宽度，而不是被固定 40em 拉宽溢出。
    expect(out).toContain(".toc-link { width: min(100%, 40rem);");
  });

  it("width:!important 保留重要级，只替换值", () => {
    const css = `.cut { width: 36% !important; }`;
    const out = rewriteCssUrls(css, "OEBPS/Styles/main.css", urlFor);
    expect(out).toContain("width: min(36%, 14.4rem) !important");
  });

  it("width>100%（刻意出血）、0% 与 max-/min-width 不改写", () => {
    const css = `.bleed { width: 120%; }
.zero { width: 0%; }
.bounds { max-width: 50%; min-width: 50%; }`;
    const out = rewriteCssUrls(css, "OEBPS/Styles/main.css", urlFor);
    expect(out).toContain(".bleed { width: 120%; }");
    expect(out).toContain(".zero { width: 0%; }");
    // max-width/min-width 里的 “width:” 子串不能误匹配
    expect(out).toContain(".bounds { max-width: 50%; min-width: 50%; }");
    expect(out).not.toContain("min(");
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

  it("嵌套选择器（含后代组合器）的 width:% 不换算（相对限宽父容器）", () => {
    const css = `.authorbox { width: 90%; max-width: 14em; }
.authorbox table { margin: 0 auto; width: 100%; }
.authorbox td { width: 50%; }`;
    const out = rewriteCssUrls(css, "OEBPS/Styles/main.css", urlFor);
    // 顶层简单选择器仍按版心换算
    expect(out).toContain(".authorbox { width: min(90%, 36rem);");
    // 嵌套选择器的 % 保留（相对 .authorbox，而非整页）
    expect(out).toContain(".authorbox table { margin: 0 auto; width: 100%; }");
    expect(out).toContain(".authorbox td { width: 50%; }");
  });

  it("纯标签选择器的 width:% 不换算（note/table 的 100% 相对父容器）", () => {
    const css = `note { display: block; width: 100%; }
table { width: 100%; }
p.cut { width: 90%; }`;
    const out = rewriteCssUrls(css, "OEBPS/Styles/main.css", urlFor);
    expect(out).toContain("note { display: block; width: 100%; }");
    expect(out).toContain("table { width: 100%; }");
    // 带类选择器仍按版心换算
    expect(out).toContain("p.cut { width: min(90%, 36rem); }");
  });

  it("声明了 float 的规则的 width:% 不换算（相对限宽包含块）", () => {
    const css = `.ctt { width: 100%; float: left; }
.paper { width: 90%; }`;
    const out = rewriteCssUrls(css, "OEBPS/Styles/main.css", urlFor);
    expect(out).toContain(".ctt { width: 100%; float: left; }");
    expect(out).toContain(".paper { width: min(90%, 36rem); }");
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
    expect(out).toContain(".paper { width: min(90%, 36rem);");
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
    expect(out).toContain(".paper { width: min(50%, 20rem); }");
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
    expect(out).toContain(".x { width: min(90%, 36rem); }");
  });
});
