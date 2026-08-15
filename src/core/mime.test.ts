import { describe, expect, it } from "vitest";
import { guessMediaType, isFontMediaType, EPUB2_CORE_TYPES, EPUB3_CORE_TYPES } from "./mime";

describe("guessMediaType", () => {
  it("按扩展名推断", () => {
    expect(guessMediaType("a.xhtml")).toBe("application/xhtml+xml");
    expect(guessMediaType("b.css")).toBe("text/css");
    expect(guessMediaType("c.jpg")).toBe("image/jpeg");
    expect(guessMediaType("d.woff2")).toBe("font/woff2");
    expect(guessMediaType("e.opf")).toBe("application/oebps-package+xml");
  });
  it("未知扩展名用默认值", () => {
    expect(guessMediaType("f.xyz")).toBe("application/octet-stream");
    expect(guessMediaType("noext")).toBe("application/octet-stream");
  });
  it("扩展名大小写不敏感", () => {
    expect(guessMediaType("G.PNG")).toBe("image/png");
  });
});

describe("isFontMediaType（字体混淆应用范围）", () => {
  it("识别各字体格式", () => {
    expect(isFontMediaType("font/ttf")).toBe(true);
    expect(isFontMediaType("font/otf")).toBe(true);
    expect(isFontMediaType("font/woff")).toBe(true);
    expect(isFontMediaType("font/woff2")).toBe(true);
    expect(isFontMediaType("application/vnd.ms-opentype")).toBe(true);
    expect(isFontMediaType("application/x-font-ttf")).toBe(true);
  });
  it("识别旧版 IDPF 字体媒体类型（epubcheck 兼容）", () => {
    expect(isFontMediaType("application/font-woff")).toBe(true);
    expect(isFontMediaType("application/font-otf")).toBe(true);
    expect(isFontMediaType("application/font-sfnt")).toBe(true);
  });
  it("非字体类型返回 false", () => {
    expect(isFontMediaType("image/png")).toBe(false);
    expect(isFontMediaType("application/xhtml+xml")).toBe(false);
  });
});

describe("核心媒体类型", () => {
  it("EPUB2 核心类型不含字体", () => {
    expect(EPUB2_CORE_TYPES.has("application/xhtml+xml")).toBe(true);
    expect(EPUB2_CORE_TYPES.has("image/png")).toBe(true);
    expect(EPUB2_CORE_TYPES.has("font/otf")).toBe(false);
    expect(EPUB2_CORE_TYPES.has("video/mp4")).toBe(false);
  });
  it("EPUB3 核心类型含字体与音视频", () => {
    expect(EPUB3_CORE_TYPES.has("font/woff2")).toBe(true);
    expect(EPUB3_CORE_TYPES.has("video/mp4")).toBe(true);
  });
});
