import { describe, expect, it } from "vitest";
import { fontFamilyFromFileName, fontIdFromHash } from "./fontStore";

describe("fontStore helpers", () => {
  it("fontFamilyFromFileName 去除扩展名并压缩连续空白", () => {
    expect(fontFamilyFromFileName("My Font.ttf")).toBe("My Font");
    expect(fontFamilyFromFileName("NotoSansSC-Bold.otf")).toBe("NotoSansSC-Bold");
    expect(fontFamilyFromFileName("  two   spaces .woff2 ")).toBe("two spaces");
    expect(fontFamilyFromFileName("noext")).toBe("noext");
  });

  it("fontIdFromHash 小写化", () => {
    expect(fontIdFromHash("ABCDEF")).toBe("abcdef");
  });
});
