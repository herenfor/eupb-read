import { describe, expect, it } from "vitest";
import { decodeBytes } from "./resources";

describe("decodeBytes（编码容错）", () => {
  it("UTF-8 正常解码", () => {
    const bytes = new TextEncoder().encode("中文正文");
    expect(decodeBytes(bytes)).toBe("中文正文");
  });

  it("UTF-16LE（带 BOM）", () => {
    const text = "旧书常见编码";
    const buf = new ArrayBuffer(2 + text.length * 2);
    const view = new DataView(buf);
    view.setUint16(0, 0xfeff, true); // LE BOM
    for (let i = 0; i < text.length; i++) {
      view.setUint16(2 + i * 2, text.charCodeAt(i), true);
    }
    expect(decodeBytes(new Uint8Array(buf))).toBe(text);
  });

  it("UTF-16BE（带 BOM）", () => {
    const text = "BE 编码";
    const buf = new ArrayBuffer(2 + text.length * 2);
    const view = new DataView(buf);
    view.setUint16(0, 0xfeff, false); // BE BOM
    for (let i = 0; i < text.length; i++) {
      view.setUint16(2 + i * 2, text.charCodeAt(i), false);
    }
    expect(decodeBytes(new Uint8Array(buf))).toBe(text);
  });

  it("空数据", () => {
    expect(decodeBytes(new Uint8Array(0))).toBe("");
  });
});
