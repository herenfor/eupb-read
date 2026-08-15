import { describe, expect, it } from "vitest";
import { sanitizeChapter, VIEWER_ID } from "./sanitize";
import { DEFAULT_SETTINGS } from "./settings";

function opts(basePath = "OEBPS/Text/ch1.xhtml") {
  return {
    basePath,
    strictXml: true,
    // 模拟资源缺失：含 missing 的路径解析不到
    urlFor: (p: string) => (p.includes("missing") ? undefined : `blob:test/${p}`),
    settings: DEFAULT_SETTINGS,
  };
}

describe("sanitizeChapter", () => {
  it("移除脚本与事件属性", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<script>alert(1)</script>
</head><body onclick="evil()">
<p onmouseover="x()">正文</p>
<a href="javascript:alert(1)">链接</a>
</body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onmouseover");
    expect(out).not.toContain("javascript:");
  });

  it("图片 src 改写为 blob URL；缺失资源移除并记 issue", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<img src="images/a.png" alt="a"/>
<img src="images/missing.png" alt="b"/>
</body></html>`;
    const res = await sanitizeChapter(html, opts());
    expect(res.html).toContain('src="blob:test/OEBPS/Text/images/a.png"');
    expect(res.html).not.toContain("missing.png");
    expect(res.issues.some((i) => i.includes("missing.png"))).toBe(true);
  });

  it("样式表 link 改写为 blob URL", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<link rel="stylesheet" href="../css/main.css"/>
</head><body>正文</body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain('href="blob:test/OEBPS/css/main.css"');
  });

  it("内联 style 的 url() 被改写", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<p style="background: url(../img/x.png)">t</p>
</body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain("blob:test/OEBPS/img/x.png");
  });

  it("注入 CSP 与覆盖样式（含字号/主题）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>t</p></body></html>`;
    const { html: out } = await sanitizeChapter(html, {
      ...opts(),
      settings: { ...DEFAULT_SETTINGS, fontSizePx: 20, theme: "dark" },
    });
    expect(out).toContain("Content-Security-Policy");
    expect(out).toContain("script-src 'none'");
    expect(out).toContain(`#${VIEWER_ID}`);
    expect(out).toContain("font-size: 20px");
    expect(out).toContain("#1e1e1e");
  });

  it("严格 XML 失败时降级 HTML 并标记", async () => {
    // 重复属性在 XML 模式属于致命错误（浏览器 DOMParser 与 xmldom 均报告）
    const broken = `<html xmlns="http://www.w3.org/1999/xhtml"><body><p id="a" id="b">重复属性</p></body></html>`;
    const res = await sanitizeChapter(broken, opts());
    expect(res.downgraded).toBe(true);
    expect(res.html).toContain("重复属性");
  });

  it("外部链接与页内锚点保持不变", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<a href="https://example.com">外链</a>
<a href="#sec1">锚点</a>
</body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('href="#sec1"');
  });

  it("script 后的正文仍保留（删脚本不删内容）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head><script src="x.js"/></head><body><p>正文文字</p></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain("正文文字");
  });

  it("自闭合 <script/>（XHTML 风格）不吞正文：先补闭合再删除", async () => {
    // 真实书场景：HTML 解析器忽略 script 自闭合标志，会吞掉全部后续内容
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<script type="text/javascript" src="../Misc/script.js"/>
</head><body><h4>第一章</h4><p>正文第一段</p><p>正文第二段</p></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).not.toContain("<script");
    expect(out).toContain("第一章");
    expect(out).toContain("正文第一段");
    expect(out).toContain("正文第二段");
  });

  it("样式表内容被改写（@import 链 + url 相对路径）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<link rel="stylesheet" href="../css/main.css"/>
</head><body>正文</body></html>`;
    const getText = (p: string): string | undefined =>
      p === "OEBPS/css/main.css"
        ? `@import "default.css"; @font-face{font-family:x;src:url(../fonts/a.ttf)}`
        : undefined;
    const makeUrl = (text: string, type: string): string =>
      `blob:css/${type}/${encodeURIComponent(text)}`;
    const res = await sanitizeChapter(html, { ...opts(), getText, makeUrl });
    expect(res.html).toContain('href="blob:css/text/css/');
    const rewritten = decodeURIComponent(
      /href="blob:css\/text\/css\/([^"]+)"/.exec(res.html)![1]
    );
    expect(rewritten).toContain('@import url("blob:test/OEBPS/css/default.css")');
    expect(rewritten).toContain('url("blob:test/OEBPS/fonts/a.ttf")');
  });

  it("纯图片页注入 fullpage-image 类与整屏填充样式", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>封面</title></head>
<body><div class="cover"><img alt="cover" src="cover.jpg"/></div></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts("OEBPS/Text/cover.xhtml"));
    expect(out).toContain('class="fullpage-image"');
    expect(out).toContain("object-fit: contain");
    expect(out).toContain("height: 100% !important");
  });

  it("文字页不注入 fullpage-image", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>有文字</p><img alt="x" src="a.png"/></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).not.toContain("fullpage-image");
  });

  it("正文被包进 #epub-viewer 分页容器", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body><h1>标题</h1><p>正文</p></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    const viewerStart = out.indexOf(`id="${VIEWER_ID}"`);
    expect(viewerStart).toBeGreaterThan(-1);
    // 容器内包含正文内容，容器闭合后直接是 </body>
    const after = out.slice(viewerStart);
    const closeIdx = after.indexOf("</div>");
    expect(after.slice(0, closeIdx)).toContain("正文");
    expect(after.slice(closeIdx)).toContain("</body>");
  });
});
