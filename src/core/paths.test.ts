import { describe, expect, it } from "vitest";
import { normalizePath, resolvePath, splitHref, isExternalUrl } from "../core/paths";

describe("normalizePath", () => {
  it("处理 . 与 .. 与空段", () => {
    expect(normalizePath("OEBPS/./ch1.xhtml")).toBe("OEBPS/ch1.xhtml");
    expect(normalizePath("OEBPS/../META-INF/container.xml")).toBe("META-INF/container.xml");
    expect(normalizePath("a//b///c")).toBe("a/b/c");
  });
  it("解码百分号编码", () => {
    expect(normalizePath("OEBPS/my%20book/ch1.xhtml")).toBe("OEBPS/my book/ch1.xhtml");
  });
  it("保持大小写", () => {
    expect(normalizePath("OEBPS/Chapter1.xhtml")).toBe("OEBPS/Chapter1.xhtml");
  });
});

describe("resolvePath", () => {
  it("相对 base 目录解析", () => {
    expect(resolvePath("OEBPS/Text/ch1.xhtml", "img/a.png")).toBe("OEBPS/Text/img/a.png");
    expect(resolvePath("OEBPS/Text/ch1.xhtml", "../style.css")).toBe("OEBPS/style.css");
    expect(resolvePath("book.opf", "ch1.xhtml")).toBe("ch1.xhtml");
  });
  it("根路径直接规范化", () => {
    expect(resolvePath("OEBPS/ch1.xhtml", "/META-INF/container.xml")).toBe(
      "META-INF/container.xml"
    );
  });
  it("外部 URL 不被误解析", () => {
    expect(resolvePath("OEBPS/ch1.xhtml", "https://example.com/a.png")).toBe(
      "OEBPS/https:/example.com/a.png"
    );
    expect(isExternalUrl("https://example.com/a.png")).toBe(true);
    expect(isExternalUrl("data:image/png;base64,AA==")).toBe(true);
    expect(isExternalUrl("images/a.png")).toBe(false);
  });
});

describe("splitHref", () => {
  it("拆出路径与锚点", () => {
    expect(splitHref("ch1.xhtml#sec1")).toEqual({ path: "ch1.xhtml", anchor: "sec1" });
    expect(splitHref("ch1.xhtml")).toEqual({ path: "ch1.xhtml", anchor: "" });
    expect(splitHref("#top")).toEqual({ path: "", anchor: "top" });
  });
});
