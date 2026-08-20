import { describe, expect, it, vi } from "vitest";
import type { Book } from "../core/types";
import { decodeBytes, ResourceServer } from "./resources";

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

function book(): Book {
  return {
    version: 3,
    opfPath: "OEBPS/content.opf",
    metadata: { title: "test", identifier: "test", language: "zh" },
    manifest: new Map(),
    spine: [],
    guide: [],
    toc: [],
    resources: new Map([
      [
        "OEBPS/img.png",
        { path: "OEBPS/img.png", data: new Uint8Array([1, 2, 3]), mediaType: "image/png" },
      ],
    ]),
    fixedLayout: false,
    issues: [],
    drmProtected: false,
  };
}

describe("ResourceServer lifecycle", () => {
  it("共享资源 URL 复用，并在会话结束 revokeAll 后幂等清空", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:book/shared");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      const server = new ResourceServer(book());
      expect(server.urlFor("OEBPS/img.png")).toBe("blob:book/shared");
      expect(server.urlFor("OEBPS/img.png")).toBe("blob:book/shared");
      expect(create).toHaveBeenCalledTimes(1);
      server.revokeAll();
      server.revokeAll();
      expect(revoke).toHaveBeenCalledTimes(1);
      expect(revoke).toHaveBeenCalledWith("blob:book/shared");
    } finally {
      create.mockRestore();
      revoke.mockRestore();
    }
  });

  it("caches decoded chapter text with LRU hit/eviction and skips oversized entries", () => {
    const decode = vi.fn((bytes: Uint8Array) => new TextDecoder().decode(bytes));
    const b = book();
    b.resources = new Map([
      ["a", { path: "a", data: new TextEncoder().encode("alpha"), mediaType: "text/html" }],
      ["b", { path: "b", data: new TextEncoder().encode("bravo"), mediaType: "text/html" }],
      ["huge", { path: "huge", data: new TextEncoder().encode("1234567890123"), mediaType: "text/html" }],
    ]);
    const server = new ResourceServer(b, { textCacheMaxBytes: 20, textCacheMaxEntries: 2, decoder: decode });
    expect(server.textFor("a")).toBe("alpha");
    expect(server.textFor("a")).toBe("alpha");
    expect(server.textFor("b")).toBe("bravo");
    expect(server.textFor("huge")).toBe("1234567890123");
    expect(server.textCacheStats.hits).toBe(1);
    expect(server.textCacheStats.entries).toBe(2);
    expect(server.textCacheStats.bytes).toBe(20);
    expect(server.textFor("a")).toBe("alpha");
    expect(server.textCacheStats.misses).toBe(3);
    expect(server.textFor("huge")).toBe("1234567890123");
    expect(server.textCacheStats.misses).toBe(4);
    server.revokeAll();
    expect(server.textCacheStats.entries).toBe(0);
    expect(server.textCacheStats.bytes).toBe(0);
    expect(server.textCacheStats.hits).toBe(2);
    expect(server.textCacheStats.misses).toBe(4);
  });
});
