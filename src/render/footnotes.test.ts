import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { isFootnoteLink, resolveFootnote } from "./footnotes";

function doc(bodyHtml: string): Document {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${bodyHtml}</body></html>`);
  return document;
}

function anchor(d: Document, selector: string): HTMLAnchorElement {
  const el = d.querySelector(selector);
  if (!el) throw new Error(`selector not found: ${selector}`);
  return el as HTMLAnchorElement;
}

describe("script.js（LK 参考脚本）脚注模式识别", () => {
  it("识别 <note> 内 <sup><a href=#asideId> 的通用弹注结构", () => {
    const d = doc(`
<note><p>正文<sup><a href="p-002.xhtml#note001"><img alt="note"/></a></sup></p>
<aside id="note001"><p>注：SECOM，日本保全公司</p></aside></note>`);
    const a = anchor(d, "a");
    expect(isFootnoteLink(a)).toBe(true);
    expect(resolveFootnote(d, a)?.text).toBe("注：SECOM，日本保全公司");
  });

  it("仅 href 为纯 #id 也识别", () => {
    const d = doc(`
<note><p><sup><a href="#n1">*</a></sup></p>
<aside id="n1">注释文本</aside></note>`);
    const a = anchor(d, "a");
    expect(isFootnoteLink(a)).toBe(true);
    expect(resolveFootnote(d, a)?.text).toBe("注释文本");
  });

  it("note 内但不在 sup 的普通链接不误判为弹注", () => {
    const d = doc(`
<note><p><a href="#n1">普通链接</a></p>
<aside id="n1">注释文本</aside></note>`);
    const a = anchor(d, "a");
    expect(isFootnoteLink(a)).toBe(false);
    expect(resolveFootnote(d, a)).toBeNull();
  });

  it("锚点不命中同容器 aside 时不是弹注", () => {
    const d = doc(`
<note><p><sup><a href="#other">*</a></sup></p>
<aside id="n1">注释文本</aside></note>`);
    const a = anchor(d, "a");
    expect(isFootnoteLink(a)).toBe(false);
  });

  it("保留多看/掌阅类识别（duokan-footnote / noteref / zhangyue-footnote）", () => {
    const d = doc(`
<p>正文<sup><a class="duokan-footnote" epub:type="noteref" href="x.xhtml#n1">
<img class="zhangyue-footnote" alt="note"/></a></sup></p>
<aside epub:type="footnote" id="n1"><p>注释内容</p></aside>`);
    const a = anchor(d, "a");
    expect(isFootnoteLink(a)).toBe(true);
    expect(resolveFootnote(d, a)?.text).toBe("注释内容");
  });

  it("注释 aside 缺文本时回退到标记图片的 zy-footnote 属性", () => {
    const d = doc(`
<note><p><sup><a href="#n1"><img alt="note" zy-footnote="注：来自属性"/></a></sup></p>
<aside id="n1"></aside></note>`);
    const a = anchor(d, "a");
    expect(isFootnoteLink(a)).toBe(true);
    expect(resolveFootnote(d, a)?.text).toBe("注：来自属性");
  });

  it("目标缺失时 resolve 返回 null（交给常规链接跳转逻辑）", () => {
    const d = doc(`
<note><p><sup><a class="duokan-footnote" href="other.xhtml#n1">*</a></sup></p></note>`);
    const a = anchor(d, "a");
    expect(isFootnoteLink(a)).toBe(true);
    expect(resolveFootnote(d, a)).toBeNull();
  });

  it("百分号编码的锚点可解码匹配 aside id", () => {
    const d = doc(`
<note><p><sup><a href="#note%201">*</a></sup></p>
<aside id="note 1">带空格 id</aside></note>`);
    const a = anchor(d, "a");
    expect(isFootnoteLink(a)).toBe(true);
    expect(resolveFootnote(d, a)?.text).toBe("带空格 id");
  });
});
