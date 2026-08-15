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
});
