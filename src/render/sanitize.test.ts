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

  it("@import 被导入的样式表也递归内联并换算 width:%", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<link rel="stylesheet" href="../css/main.css"/>
</head><body><div class="paper">信件</div></body></html>`;
    const getText = (p: string): string | undefined => {
      if (p === "OEBPS/css/main.css") return `@import "default.css"; .paper { max-width: 30em; }`;
      if (p === "OEBPS/css/default.css") return `.paper { width: 90%; }`;
      return undefined;
    };
    const makeUrl = (text: string, type: string): string =>
      `blob:css/${type}/${encodeURIComponent(text)}`;
    const res = await sanitizeChapter(html, { ...opts(), getText, makeUrl });
    const rewritten = decodeURIComponent(
      /href="blob:css\/text\/css\/([^"]+)"/.exec(res.html)![1]
    );
    expect(rewritten).toContain(".paper { width: 36em; }");
    expect(rewritten).toContain(".paper { max-width: 30em; }");
    expect(rewritten).not.toContain("@import url(");
  });

  it("主题覆盖样式尊重书声明的更窄 max-width（类规则优先）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body><div class="paper">信件</div></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain(`:where(#${VIEWER_ID}) :not(img)`);
    expect(out).toContain("max-width: 40em;");
    expect(out).not.toContain("max-width: 40em !important");
  });

  it("居中 margin 只作为默认值，不覆盖书声明的左右 margin", async () => {
    // 目录条目类（如 .bg1box{margin-right:2em}）必须能覆盖阅读器默认的 auto
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<style>.toc{margin:0 0 0.5em}.bg1box{margin-right:2em}.bg2box{margin-left:2em}</style>
</head><body><div class="toc bg1box">一</div><div class="toc bg2box">二</div></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain("margin-left: auto;");
    expect(out).not.toContain("margin-left: auto !important");
    expect(out).not.toContain("margin-right: auto !important");
    // 书规则完整保留
    expect(out).toContain("margin-right:2em");
    expect(out).toContain("margin-left:2em");
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

  it("多图纯图片页不注入 fullpage-image（title 页上下两张图不能被拆成两页）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<div style="margin:0 auto 1em"><p><img alt="t1" src="t1.png" style="width:21em"/></p></div>
<div style="margin:1em auto 0"><p><img alt="t2" src="t2.png" style="width:7em"/></p></div>
</body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).not.toContain("fullpage-image");
    // 保留书自身排版声明
    expect(out).toContain("width:21em");
    expect(out).toContain("width:7em");
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

  it("普通图片不覆盖书定义的高度（height:auto 不得强制；用 object-fit 防拉伸）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<p class="cut"><img alt="kugiri" src="kugiri.png"/></p>
</body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    // 通用图片规则：不再有 height: auto !important（会压掉 .cut img{height:2em}）
    expect(out).toContain("max-width: 100% !important; object-fit: contain");
    expect(out).not.toContain("height: auto !important");
  });

  it("book 的 bgcolor 在浅色主题下应用到版面，深色主题忽略", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body bgcolor="#f5f0e6"><p>正文</p></body></html>`;
    const light = await sanitizeChapter(html, opts());
    expect(light.html).toContain("background-color: #f5f0e6 !important");
    const dark = await sanitizeChapter(html, {
      ...opts(),
      settings: { ...DEFAULT_SETTINGS, theme: "dark" as const },
    });
    expect(dark.html).not.toContain("background-color: #f5f0e6 !important");
  });

  it("bgcolor 非法值不注入（防 CSS 注入）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body bgcolor="red;} #epub-viewer{display:none"><p>正文</p></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    // 非法值不得进入 CSS（body 属性本身保留无害，浏览器会忽略无效颜色）
    expect(out).not.toMatch(/background:\s*red/);
    expect(out).not.toContain('data-reader="bgcolor"');
  });

  it("width:% 内联样式换算为版心宽度（90% → 36em）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<div style="width:90%; padding:1em" id="b">x</div>
<table width="50%"><tr><td>y</td></tr></table>
</body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain("width: 36em");
    expect(out).toContain("width: 20em");
  });

  it("全页图块内部 / 已定宽祖先内部 / img 的 width:% 不换算", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<div class="illus"><div style="width:90%" id="a">x</div></div>
<div style="width:20em"><div style="width:90%" id="b">y</div></div>
<img style="width:90%" alt="i" src="a.png"/>
</body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain('style="width:90%"');
    expect(out).not.toContain("width: 36em");
  });

  it("table 不再豁免版心限宽（width:90% 的表格同样收进版心）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><body><table width="90%"><tr><td>t</td></tr></table></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    // 覆盖样式里不再有 table 专属 max-width 规则
    expect(out).not.toMatch(/#epub-viewer table/);
  });

  it("页内 <style> 块的 url() 与 width:% 都被改写", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<style>.paper{width:90%;background:url(../img/bg.png)}</style>
</head><body><div class="paper">x</div></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain("width: 36em");
    expect(out).toContain('url("blob:test/OEBPS/img/bg.png")');
  });

  it("script.js 模式的 <note> 内 aside 也被隐藏（正文中不显示注释块）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<style>note{display:block}</style>
</head><body><note><p>正文<sup><a href="#n1">*</a></sup></p>
<aside id="n1"><p>注释内容</p></aside></note></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain(`${VIEWER_ID} note aside { display: none !important; }`);
    // 结构保留，供阅读器弹层提取
    expect(out).toContain('href="#n1"');
    expect(out).toContain("注释内容");
  });

  it("主题覆盖样式不重置书在 body 上声明的背景图", async () => {
    // 真实书场景：目录页在 <style> 里给 body 设置 background-image。
    // 注入的主题样式若用 background 简写，会把 background-image 重置为 none。
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<style>body{background-image:url(../Images/bdimg.webp);background-repeat:no-repeat;
background-position:center center;background-size:cover;background-color:#f9ebdf;}</style>
</head><body><div class="tocbox">CONTENTS</div></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain('url("blob:test/OEBPS/Images/bdimg.webp")');
    // 主题样式只覆盖背景色（在书样式之后注入），不再用 background 简写
    expect(out).toContain("body { color: #1a1a1a; background-color: #ffffff;");
    expect(out).not.toMatch(/body\s*\{\s*color:[^}]*background:\s*#/);
  });

  it("bgcolor 注入不遮挡 body 背景图（只用 background-color 且作用于 body）", async () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<style>body{background-image:url(../Images/bdimg.webp)}</style>
</head><body bgcolor="#f5f0e6"><p>正文</p></body></html>`;
    const { html: out } = await sanitizeChapter(html, opts());
    expect(out).toContain('url("blob:test/OEBPS/Images/bdimg.webp")');
    expect(out).toContain("body { background-color: #f5f0e6 !important; }");
    // 不再给 viewer 铺不透明背景，否则会遮住 body 的背景图
    expect(out).not.toMatch(/epub-viewer\s*\{\s*background:/);
  });
});
