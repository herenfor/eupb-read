import { describe, expect, it } from "vitest";
import {
  getBorderBoxWidth,
  getFragmentNavigation,
  hasPercentageHorizontalMargin,
  isMediaOnlyFloatContent,
  isPercentageMarginLayout,
  isSymmetricHorizontalMargin,
  restoreInlineStyleProperty,
  syncFragmentHash,
} from "./paginator";

const textNode = (text: string): Node =>
  ({ nodeType: 3, textContent: text }) as Node;

const elementNode = (tagName: string): Node =>
  ({ nodeType: 1, textContent: "", tagName }) as unknown as Node;

describe("float shrink compensation", () => {
  it("把只有图片和源码缩进空白的小型 float 视为正常媒体布局", () => {
    expect(
      isMediaOnlyFloatContent([
        textNode("\n    "),
        elementNode("IMG"),
        textNode("\n  "),
      ])
    ).toBe(true);
    expect(isMediaOnlyFloatContent([elementNode("svg")])).toBe(true);
  });

  it("不跳过含可见文字、其他行内容或空内容的 float", () => {
    expect(isMediaOnlyFloatContent([elementNode("IMG"), textNode("tomochan")])).toBe(false);
    expect(isMediaOnlyFloatContent([elementNode("SPAN")])).toBe(false);
    expect(isMediaOnlyFloatContent([textNode("  ")])).toBe(false);
  });
});

describe("fragment navigation", () => {
  it("解码目标 id，跳过空 fragment，并保留无法解码的原始值", () => {
    expect(getFragmentNavigation("#target%201")).toEqual({
      hash: "#target%201",
      anchor: "target 1",
    });
    expect(getFragmentNavigation("#target%23part")).toEqual({
      hash: "#target%23part",
      anchor: "target#part",
    });
    expect(getFragmentNavigation("#bad%2")).toEqual({
      hash: "#bad%2",
      anchor: "bad%2",
    });
    expect(getFragmentNavigation("#")).toBeNull();
    expect(getFragmentNavigation("chapter.xhtml#target")).toBeNull();
  });

  it("安全同步 iframe hash，并忽略空值和不可访问的 location", () => {
    let hash = "";
    let writes = 0;
    const win = {
      location: {
        get hash() {
          return hash;
        },
        set hash(value: string) {
          writes += 1;
          hash = value;
        },
      },
    } as unknown as Window;

    syncFragmentHash(win, "#target%201");
    expect(hash).toBe("#target%201");
    expect(writes).toBe(1);
    syncFragmentHash(win, "#target%201");
    expect(writes).toBe(1);
    syncFragmentHash(win, "#");
    expect(writes).toBe(1);

    const inaccessible = {
      get location(): Location {
        throw new Error("iframe already unloaded");
      },
    } as unknown as Window;
    expect(() => syncFragmentHash(inaccessible, "#target2")).not.toThrow();
  });
});

describe("book margin layout", () => {
  it("用 border-box 宽度识别带 padding/border 的 auto 居中盒", () => {
    expect(
      getBorderBoxWidth({
        width: "446px",
        boxSizing: "content-box",
        paddingLeft: "8px",
        paddingRight: "8px",
        borderLeftWidth: "1px",
        borderRightWidth: "1px",
      })
    ).toBe(464);
    expect(
      getBorderBoxWidth({
        width: "464px",
        boxSizing: "border-box",
        paddingLeft: "8px",
        paddingRight: "8px",
        borderLeftWidth: "1px",
        borderRightWidth: "1px",
      })
    ).toBe(464);
  });

  it("hr 的 1px 双侧边框计入版心宽度，避免被误判为书籍不对称 margin", () => {
    const width = getBorderBoxWidth({
      width: "640px",
      boxSizing: "content-box",
      paddingLeft: "0px",
      paddingRight: "0px",
      borderLeftWidth: "1px",
      borderRightWidth: "1px",
    });
    expect(width).toBe(642);
    expect((1280 - width) / 2).toBe(319);
  });

  it("正值且相等的书籍水平 margin 是双侧留白，不应被解释成单向缩进", () => {
    expect(isSymmetricHorizontalMargin("16px", "16px")).toBe(true);
    expect(isSymmetricHorizontalMargin("16px", "16.3px")).toBe(true);
    expect(isSymmetricHorizontalMargin("16px", "17px")).toBe(false);
    expect(isSymmetricHorizontalMargin("16px", "0px")).toBe(false);
    expect(isSymmetricHorizontalMargin("-16px", "-16px")).toBe(false);
    expect(isSymmetricHorizontalMargin("auto", "auto")).toBe(false);
  });

  it("把作者的百分比水平 margin 作为包含块布局，而不是版心内缩进", () => {
    expect(
      hasPercentageHorizontalMargin({ margin: "0 0 0 35%", marginLeft: "", marginRight: "" })
    ).toBe(true);
    expect(
      hasPercentageHorizontalMargin({ margin: "5% 0", marginLeft: "", marginRight: "" })
    ).toBe(false);
    expect(isPercentageMarginLayout(true, "448px", "0px")).toBe(true);
    expect(isPercentageMarginLayout(true, "0px", "0px")).toBe(false);
    expect(isPercentageMarginLayout(false, "448px", "0px")).toBe(false);
  });

  it("恢复被二阶段布局覆盖的 inline 值及 !important 优先级", () => {
    const values = new Map<string, string>([
      ["margin-left", "35%"],
      ["max-width", "none"],
    ]);
    const priorities = new Map<string, string>([["margin-left", "important"]]);
    const style = {
      getPropertyValue: (property: string) => values.get(property) ?? "",
      getPropertyPriority: (property: string) => priorities.get(property) ?? "",
      setProperty: (property: string, value: string, priority = "") => {
        values.set(property, value);
        if (priority) priorities.set(property, priority);
        else priorities.delete(property);
      },
      removeProperty: (property: string) => {
        values.delete(property);
        priorities.delete(property);
        return "";
      },
    } as unknown as CSSStyleDeclaration;

    restoreInlineStyleProperty(style, "margin-left", { value: "35%", priority: "important" });
    restoreInlineStyleProperty(style, "max-width", { value: "", priority: "" });

    expect(style.getPropertyValue("margin-left")).toBe("35%");
    expect(style.getPropertyPriority("margin-left")).toBe("important");
    expect(style.getPropertyValue("max-width")).toBe("");
  });
});
