import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import {
  MAX_ANCHOR_SNIPPET_CODE_POINTS,
  buildVisibleTextIndex,
  resolveTextAnchorOffset,
  sanitizePersistedTextAnchor,
} from "./textAnchor";

function chapter(markup: string): { document: Document; viewer: HTMLElement } {
  const { document } = parseHTML(`<html><body><epub-viewer id="epub-viewer">${markup}</epub-viewer></body></html>`);
  return { document: document as unknown as Document, viewer: document.getElementById("epub-viewer") as HTMLElement };
}

describe("visible text anchor index", () => {
  it("counts deep p>a>span text exactly once and uses Unicode code points", () => {
    const { document, viewer } = chapter("<p>甲<a><span>😀乙</span></a></p><p> 丙\n丁 </p>");
    const index = buildVisibleTextIndex(document, viewer);
    expect(index.text).toBe("甲😀乙丙丁");
    expect(index.totalChars).toBe(5);
    // UTF-16 raw offset 2 is immediately after 😀, but persisted offset is
    // code-point based: 甲 + 😀 = 2 rather than 3 UTF-16 units.
    expect(index.offsetForNode(document.querySelector("span")!.firstChild!, 2)).toBe(2);
    expect(index.offsetForNode(document.querySelector("span")!.firstChild!, 1)).toBe(1);
  });

  it("excludes hidden/script/style and footnote text without changing chapter DOM or styles", () => {
    const { document, viewer } = chapter(
      '<p style="color:red">正文</p><script>bad()</script><style>.x{display:none}</style><p hidden>隐藏</p><aside epub:type="footnote">脚注</aside>'
    );
    const before = viewer.innerHTML;
    const index = buildVisibleTextIndex(document, viewer);
    expect(index.text).toBe("正文");
    expect(viewer.innerHTML).toBe(before);
    expect(document.querySelector("p")?.getAttribute("style")).toBe("color:red");
  });

  it("validates original offsets, searches snippets linearly after drift, and chooses the nearest duplicate", () => {
    const { document, viewer } = chapter("<p>甲共享乙共享丙</p>");
    const index = buildVisibleTextIndex(document, viewer);
    expect(resolveTextAnchorOffset(index, { textOffset: 4, textSnippet: "共享" })).toBe(4);
    expect(resolveTextAnchorOffset(index, { textOffset: 5, textSnippet: "共享" })).toBe(4);
    expect(resolveTextAnchorOffset(index, { textOffset: 5, textSnippet: "不存在" })).toBeNull();
  });

  it("rejects malformed persisted anchors and code-point snippets over the bounded limit", () => {
    expect(sanitizePersistedTextAnchor({ textOffset: -1, textSnippet: "甲" })).toEqual({ textOffset: null, textSnippet: null });
    expect(sanitizePersistedTextAnchor({ textOffset: 2 ** 53, textSnippet: "甲" })).toEqual({ textOffset: null, textSnippet: null });
    expect(sanitizePersistedTextAnchor({ textOffset: 2, textSnippet: "a b" })).toEqual({ textOffset: null, textSnippet: null });
    expect(
      sanitizePersistedTextAnchor({
        textOffset: 2,
        textSnippet: "😀".repeat(MAX_ANCHOR_SNIPPET_CODE_POINTS + 1),
      })
    ).toEqual({ textOffset: null, textSnippet: null });
  });
});
