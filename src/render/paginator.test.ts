import { describe, expect, it } from "vitest";
import {
  ChapterPaginator,
  getBorderBoxWidth,
  hasComputedPercentageHorizontalMargin,
  getFragmentNavigation,
  getReaderTopFloatContainmentMargins,
  hasAuthoredFullWidthIntentInRules,
  hasPercentageHorizontalMargin,
  hasPercentageHorizontalMarginInRules,
  hasTrailingManualPaddingWhitespace,
  hasVisibleInlineBox,
  isMediaOnlyFloatContent,
  isMediaOnlyFloatSubtree,
  hasAuthoredInlineWidth,
  isAutoLikeHorizontalMargin,
  isAuthorFullWidthValue,
  isPercentageMarginLayout,
  isSymmetricHorizontalMargin,
  restoreInlineStyleProperty,
  shouldKeepSymmetricMarginsCentered,
  shouldKeepContainingBlockMarginsWhenBaseWouldOverflow,
  shouldApplyInlineBoxOverflowFix,
  shouldApplyTrailingFloatMarginFix,
  syncFragmentHash,
} from "./paginator";

const textNode = (text: string): Node =>
  ({ nodeType: 3, textContent: text }) as Node;

const elementNode = (tagName: string): Node =>
  ({ nodeType: 1, textContent: "", tagName }) as unknown as Node;

const elementWithChildren = (tagName: string, children: Node[]): Node =>
  ({ nodeType: 1, textContent: children.map((child) => child.textContent ?? "").join(""), tagName, childNodes: children }) as unknown as Node;

describe("float shrink compensation", () => {
  it("float guard 只识别注释外的 inline width", () => {
    expect(hasAuthoredInlineWidth("/* width: 20em; */")).toBe(false);
    expect(hasAuthoredInlineWidth("/* width: 20em; */ width: 50%;")).toBe(true);
  });

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

  it("末尾装饰 float 允许递归包裹层与注释，但可见文字否决", () => {
    expect(
      isMediaOnlyFloatSubtree([
        textNode("\n  "),
        elementWithChildren("div", [
          ({ nodeType: 8, textContent: " width: 20px; " } as unknown as Node),
          elementNode("img"),
        ]),
      ])
    ).toBe(true);
    expect(isMediaOnlyFloatSubtree([elementWithChildren("div", [elementNode("svg")])])).toBe(true);
    expect(isMediaOnlyFloatSubtree([elementWithChildren("div", [textNode("装饰")])])).toBe(false);
  });

  it("末尾媒体 float 事务门控要求跨列、单列收回、边界与兄弟不重叠", () => {
    const common = {
      float: "right",
      position: "static",
      mediaOnly: true,
      beforeColumns: [0, 1],
      afterColumns: [1],
      afterRects: [{ left: 510, right: 700, top: 420, bottom: 600, width: 190, height: 180 }],
      afterVisualRects: [{ left: 510, right: 700, top: 420, bottom: 600, width: 190, height: 180 }],
      previousVisualRects: [{ left: 20, right: 300, top: 100, bottom: 300, width: 280, height: 200 }],
      estimatedBeforeBottom: 700,
      contentBottom: 620,
      viewerLeft: 0,
      scrollLeft: 0,
      step: 500,
      pageWidth: 480,
    } as const;
    expect(shouldApplyTrailingFloatMarginFix(common)).toBe(true);
    expect(shouldApplyTrailingFloatMarginFix({ ...common, beforeColumns: [1] })).toBe(false);
    expect(shouldApplyTrailingFloatMarginFix({ ...common, afterColumns: [1, 2] })).toBe(false);
    expect(
      shouldApplyTrailingFloatMarginFix({
        ...common,
        afterVisualRects: [{ ...common.afterRects[0], bottom: 621 }],
      })
    ).toBe(false);
    expect(
      shouldApplyTrailingFloatMarginFix({
        ...common,
        previousVisualRects: [{ left: 520, right: 680, top: 500, bottom: 550, width: 160, height: 50 }],
      })
    ).toBe(false);
    // The candidate union may end at contentBottom, while first-fragment top
    // plus scrollHeight proves that its unfragmented content overflows.
    expect(
      shouldApplyTrailingFloatMarginFix({
        ...common,
        estimatedBeforeBottom: 754,
      })
    ).toBe(true);
    // A child image extending left/out of the column must veto the fix even
    // when the candidate's own rect is safe.
    expect(
      shouldApplyTrailingFloatMarginFix({
        ...common,
        afterVisualRects: [
          common.afterRects[0],
          { left: 490, right: 540, top: 430, bottom: 500, width: 50, height: 70 },
        ],
      })
    ).toBe(false);
    expect(shouldApplyTrailingFloatMarginFix({ ...common, scrollLeft: 250 })).toBe(true);
  });
});

describe("right-aligned inline box overflow compensation", () => {
  const visibleBox = {
    backgroundColor: "rgb(255, 255, 255)",
    borderLeftStyle: "none",
    borderRightStyle: "none",
    borderLeftWidth: "0px",
    borderRightWidth: "0px",
    paddingLeft: "2px",
    paddingRight: "2px",
  } as CSSStyleDeclaration;
  const plainInline = {
    ...visibleBox,
    backgroundColor: "rgba(0, 0, 0, 0)",
    paddingLeft: "0px",
    paddingRight: "0px",
  } as CSSStyleDeclaration;

  it("识别全角/NBSP 手工补齐空白，不把普通空格当作候选", () => {
    expect(hasTrailingManualPaddingWhitespace("故事\u3000")).toBe(true);
    expect(hasTrailingManualPaddingWhitespace("故事\u00a0")).toBe(true);
    expect(hasTrailingManualPaddingWhitespace("故事\u3000 ")).toBe(true);
    expect(hasTrailingManualPaddingWhitespace("故事 ")).toBe(false);
  });

  it("仅把 right 对齐、可见盒、实际越界且原子化后收回的 inline 盒命中", () => {
    expect(
      hasVisibleInlineBox(visibleBox) &&
        shouldApplyInlineBoxOverflowFix({
          display: "inline",
          trailingPaddingWhitespace: true,
          visibleBox: true,
          textAlign: "right",
          rectRight: 997,
          containerRight: 960,
          fixedRectRight: 960,
          fixedWidth: 249,
          containerWidth: 640,
        })
    ).toBe(true);
  });

  it("普通行内文字、无可见盒、非 right 对齐或未越界均不改", () => {
    expect(
      hasVisibleInlineBox(plainInline) &&
        shouldApplyInlineBoxOverflowFix({
          display: "inline",
          trailingPaddingWhitespace: true,
          visibleBox: false,
          textAlign: "right",
          rectRight: 997,
          containerRight: 960,
          fixedRectRight: 960,
          fixedWidth: 249,
          containerWidth: 640,
        })
    ).toBe(false);
    expect(
      shouldApplyInlineBoxOverflowFix({
        display: "inline",
        trailingPaddingWhitespace: false,
        visibleBox: true,
        textAlign: "right",
        rectRight: 997,
        containerRight: 960,
        fixedRectRight: 960,
        fixedWidth: 249,
        containerWidth: 640,
      })
    ).toBe(false);
    expect(
      shouldApplyInlineBoxOverflowFix({
        display: "inline",
        trailingPaddingWhitespace: true,
        visibleBox: true,
        textAlign: "end",
        rectRight: 997,
        containerRight: 960,
        fixedRectRight: 960,
        fixedWidth: 249,
        containerWidth: 640,
      })
    ).toBe(false);
    expect(
      shouldApplyInlineBoxOverflowFix({
        display: "inline",
        trailingPaddingWhitespace: true,
        visibleBox: true,
        textAlign: "left",
        rectRight: 997,
        containerRight: 960,
        fixedRectRight: 960,
        fixedWidth: 249,
        containerWidth: 640,
      })
    ).toBe(false);
    expect(
      shouldApplyInlineBoxOverflowFix({
        display: "inline",
        trailingPaddingWhitespace: true,
        visibleBox: true,
        textAlign: "right",
        rectRight: 960,
        containerRight: 960,
        fixedRectRight: 960,
        fixedWidth: 249,
        containerWidth: 640,
      })
    ).toBe(false);
  });

  it("原子化后仍越界或宽度超过包含块时回滚", () => {
    expect(
      shouldApplyInlineBoxOverflowFix({
        display: "inline",
        trailingPaddingWhitespace: true,
        visibleBox: true,
        textAlign: "right",
        rectRight: 997,
        containerRight: 960,
        fixedRectRight: 980,
        fixedWidth: 249,
        containerWidth: 640,
      })
    ).toBe(false);
    expect(
      shouldApplyInlineBoxOverflowFix({
        display: "inline",
        trailingPaddingWhitespace: true,
        visibleBox: true,
        textAlign: "right",
        rectRight: 997,
        containerRight: 960,
        fixedRectRight: 960,
        fixedWidth: 700,
        containerWidth: 640,
      })
    ).toBe(false);
  });
});

describe("inline box compensation lifecycle", () => {
  it("恢复时移除 measure 标记，使下一轮仍可重新评估", () => {
    const values = new Map<string, string>([["text-indent", "12px"]]);
    const priorities = new Map<string, string>([["text-indent", "important"]]);
    const removed: string[] = [];
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
    const el = {
      style,
      removeAttribute: (name: string) => removed.push(name),
    } as unknown as HTMLElement;
    type LifecycleHost = {
      inlineBoxFixes: Array<{
        el: HTMLElement;
        display: { value: string; priority: string };
        textIndent: { value: string; priority: string };
      }>;
    };
    const restore = (
      ChapterPaginator.prototype as unknown as {
        restoreInlineBoxFixes: (this: LifecycleHost) => void;
      }
    ).restoreInlineBoxFixes;
    const host = {
      inlineBoxFixes: [
        {
          el,
          display: { value: "", priority: "" },
          textIndent: { value: "12px", priority: "important" },
        },
      ],
    } satisfies LifecycleHost;

    restore.call(host);
    expect(removed).toEqual(["data-reader-inline-box-fixed"]);
    expect(host.inlineBoxFixes).toHaveLength(0);
    expect(values.get("text-indent")).toBe("12px");
    expect(priorities.get("text-indent")).toBe("important");

    // A subsequent measure can register the same element again because the
    // stale marker was removed, then cleanup remains idempotent.
    removed.length = 0;
    host.inlineBoxFixes.push({
      el,
      display: { value: "", priority: "" },
      textIndent: { value: "12px", priority: "important" },
    });
    restore.call(host);
    expect(removed).toEqual(["data-reader-inline-box-fixed"]);
    expect(host.inlineBoxFixes).toHaveLength(0);
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

describe("internal link history notification", () => {
  const handleLinkClick = (
    ChapterPaginator.prototype as unknown as {
      handleLinkClick: (this: unknown, event: Event) => void;
    }
  ).handleLinkClick;

  function invoke(href: string, targetExists = true) {
    const before: string[] = [];
    const navigated: string[] = [];
    const external: string[] = [];
    const jumped: string[] = [];
    let settled = 0;
    const link = {
      getAttribute: (name: string) => (name === "href" ? href : null),
      classList: { contains: () => false },
      querySelector: () => null,
      closest: (selector: string) => (selector === "a" ? link : null),
    } as unknown as HTMLAnchorElement;
    const event = {
      target: link,
      preventDefault() {},
      stopPropagation() {},
    } as unknown as Event;
    const context = {
      iframe: { contentWindow: { location: { hash: "" } } },
      contentDoc: {
        getElementById: () => (targetExists ? {} : null),
      },
      viewer: {},
      step: 1,
      _currentPath: "Text/chapter.xhtml",
      onBeforeInternalNavigate: (value: string) => {
        // App 的真实回调会以 Book/spine 校验跨章目标；保留这个边界
        // harness 以确保 paginator 传递的是解析后的 href，而不是裸点击值。
        if (value === "chapter0000.xhtml#top" || value.startsWith("#")) before.push(value);
      },
      onNavigate: (value: string) => navigated.push(value),
      onExternalLink: (value: string) => external.push(value),
      jumpToAnchor: (value: string) => jumped.push(value),
      onInternalNavigationSettled: () => {
        settled += 1;
      },
    };
    handleLinkClick.call(context, event);
    return { before, navigated, external, jumped, settled };
  }

  it("跨章与同章 fragment 各通知一次，外部链接不通知", () => {
    expect(invoke("../chapter0000.xhtml#top")).toMatchObject({
      before: ["chapter0000.xhtml#top"],
      navigated: ["chapter0000.xhtml#top"],
      jumped: [],
      external: [],
    });
    expect(invoke("#target%201")).toMatchObject({
      before: ["#target%201"],
      navigated: [],
      jumped: ["target 1"],
      external: [],
      settled: 1,
    });
    expect(invoke("missing.xhtml#target")).toMatchObject({
      before: [],
      navigated: ["Text/missing.xhtml#target"],
    });
    expect(invoke("#missing", false)).toMatchObject({
      before: [],
      navigated: [],
      jumped: [],
      settled: 0,
      external: [],
    });
    expect(invoke("https://example.com")).toMatchObject({
      before: [],
      navigated: [],
      jumped: [],
      external: ["https://example.com"],
    });
  });
});

describe("book margin layout", () => {
  it("只把明确 width/min-width 全宽或 viewport 表达式视为作者突破意图", () => {
    expect(isAuthorFullWidthValue("100%", "width")).toBe(true);
    expect(isAuthorFullWidthValue("100%", "min-width")).toBe(true);
    expect(isAuthorFullWidthValue("100%", "max-width")).toBe(false);
    expect(isAuthorFullWidthValue("none", "max-width")).toBe(false);
    expect(isAuthorFullWidthValue("min(100%, 80px)", "width")).toBe(false);
    expect(isAuthorFullWidthValue("calc(100% + 2rem)", "width")).toBe(true);
    expect(isAuthorFullWidthValue("calc(100vw - 2rem)", "width")).toBe(true);
  });

  it("排除阅读器注入 stylesheet，并只读取当前生效的 media 条件", () => {
    const widthRule = {
      type: 1,
      selectorText: ".fr",
      style: { getPropertyValue: (property: string) => (property === "width" ? "100%" : "") },
    } as unknown as CSSRule;
    const injectedSheet = {
      ownerNode: { getAttribute: () => "overrides" },
      cssRules: [widthRule],
    } as unknown as CSSStyleSheet;
    const authorSheet = { ownerNode: null, cssRules: [widthRule] } as unknown as CSSStyleSheet;
    const el = { matches: (selector: string) => selector === ".fr" } as unknown as HTMLElement;
    const baseWindow = {
      matchMedia: () => ({ matches: false }),
      CSS: { supports: () => false },
    } as unknown as Window;
    const doc = (sheets: CSSStyleSheet[], win = baseWindow) =>
      ({ styleSheets: sheets, defaultView: win }) as unknown as Document;

    expect(hasAuthoredFullWidthIntentInRules(doc([injectedSheet]), el)).toBe(false);
    expect(hasAuthoredFullWidthIntentInRules(doc([authorSheet]), el)).toBe(true);

    const mediaRule = {
      type: 4,
      media: { mediaText: "(min-width: 900px)" },
      cssRules: [widthRule],
    } as unknown as CSSRule;
    expect(
      hasAuthoredFullWidthIntentInRules(
        doc([{ ownerNode: null, cssRules: [mediaRule] } as unknown as CSSStyleSheet]),
        el
      )
    ).toBe(false);
    expect(
      hasAuthoredFullWidthIntentInRules(
        doc(
          [{ ownerNode: null, cssRules: [mediaRule] } as unknown as CSSStyleSheet],
          { ...baseWindow, matchMedia: () => ({ matches: true }) } as unknown as Window
        ),
        el
      )
    ).toBe(true);
    expect(
      hasAuthoredFullWidthIntentInRules(
        doc(
          [{ ownerNode: null, cssRules: [mediaRule] } as unknown as CSSStyleSheet],
          { CSS: {} } as unknown as Window
        ),
        el
      )
    ).toBeUndefined();
  });

  const floatContainment = (
    overrides: Partial<Parameters<typeof getReaderTopFloatContainmentMargins>[0]> = {}
  ) =>
    getReaderTopFloatContainmentMargins({
      readerTop: true,
      float: "right",
      fullpage: false,
      parentWidth: 1280,
      width: 80,
      contentWidth: 640,
      marginLeft: "0px",
      marginRight: "0px",
      authorFullWidthIntent: false,
      ...overrides,
    });

  it("把宽视口的 right/left 顶层 float 内缩到 40rem 版心边缘", () => {
    expect(floatContainment()).toEqual({ left: 0, right: 320 });
    expect(floatContainment({ float: "left" })).toEqual({ left: 320, right: 0 });
  });

  it("窄于版心的容器不额外写入 margin", () => {
    expect(floatContainment({ parentWidth: 500 })).toEqual({ left: 0, right: 0 });
  });

  it("作者已有水平 margin、全页布局或过宽盒子时保守跳过", () => {
    expect(floatContainment({ marginRight: "8px" })).toBeNull();
    expect(floatContainment({ fullpage: true })).toBeNull();
    expect(floatContainment({ width: 641 })).toBeNull();
    expect(floatContainment({ authorFullWidthIntent: true })).toBeNull();
    expect(floatContainment({ readerTop: false })).toBeNull();
  });

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

  it("只让 intrinsic-size 盒保留正对称 margin 居中，普通目录标题继续走 C-04", () => {
    // 侦探少年目录标题：width:auto + margin:.75em，旧版 C-04 会把标题
    // 放在正文版心左缘再缩进 24px；不能因左右数值相等就吞掉这个缩进。
    expect(shouldKeepSymmetricMarginsCentered("24px", "24px", false)).toBe(false);

    // C-18 的原始目标：fit/max-content 灰框的 margin:1em 是双侧留白，
    // 经 intrinsic-size 补偿后仍应保持 reader auto 居中。
    expect(shouldKeepSymmetricMarginsCentered("16px", "16px", true)).toBe(true);
  });

  it("固定宽度的显式对称 margin 不冒充 auto 居中，解析后的 auto margin 仍保持居中", () => {
    expect(
      isAutoLikeHorizontalMargin({
        parentWidth: 1280,
        width: 480,
        marginLeft: 16,
        marginRight: 16,
      })
    ).toBe(false);
    expect(
      isAutoLikeHorizontalMargin({
        parentWidth: 1280,
        width: 480,
        marginLeft: 400,
        marginRight: 400,
      })
    ).toBe(true);
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

  it("临时解除 reader auto margin 后，Typed OM 以最终获胜值识别百分比和 calc", () => {
    const typed = (left: string, right = "0px"): Element =>
      ({
        computedStyleMap: () =>
          new Map([
            ["margin-left", { toString: () => left }],
            ["margin-right", { toString: () => right }],
          ]),
      }) as unknown as Element;

    expect(hasComputedPercentageHorizontalMargin(typed("70%"))).toBe(true);
    expect(hasComputedPercentageHorizontalMargin(typed("calc(70% - 1em)"))).toBe(true);
    expect(hasComputedPercentageHorizontalMargin(typed("32px", "24px"))).toBe(false);
    expect(hasComputedPercentageHorizontalMargin({} as Element)).toBeUndefined();
  });

  it("不可读外链样式表不阻断 CSSOM 回退，且不把不完整扫描当成否定结论", () => {
    const percentageRule = {
      selectorText: ".percent",
      style: { margin: "", marginLeft: "70%", marginRight: "" },
    } as unknown as CSSRule;
    const blockedSheet = {
      get cssRules(): CSSRuleList {
        throw new Error("SecurityError");
      },
    } as unknown as CSSStyleSheet;
    const readableSheet = { cssRules: [percentageRule] } as unknown as CSSStyleSheet;
    const doc = { styleSheets: [blockedSheet, readableSheet] } as unknown as Document;
    const matching = {
      matches: (selector: string) => selector === ".percent",
    } as unknown as Element;
    const nonMatching = { matches: () => false } as unknown as Element;

    expect(hasPercentageHorizontalMarginInRules(doc, matching)).toBe(true);
    expect(hasPercentageHorizontalMarginInRules(doc, nonMatching)).toBeUndefined();
  });

  it("只在作者原位可容纳、叠加版心才越列时保留未知来源的水平 margin", () => {
    // C-04 的普通 2em 缩进仍可在正文版心内放下。
    expect(
      shouldKeepContainingBlockMarginsWhenBaseWouldOverflow({
        parentWidth: 1280,
        width: 640,
        marginLeft: 32,
        marginRight: 0,
      })
    ).toBe(false);
    // 赤月目录：70% + 1.5em 原位可放下，但再加 base 会越出列。
    expect(
      shouldKeepContainingBlockMarginsWhenBaseWouldOverflow({
        parentWidth: 1280,
        width: 96,
        marginLeft: 896,
        marginRight: 24,
      })
    ).toBe(true);
    // 作者原位本就越列，不替作者重写为“安全布局”。
    expect(
      shouldKeepContainingBlockMarginsWhenBaseWouldOverflow({
        parentWidth: 1280,
        width: 300,
        marginLeft: 1000,
        marginRight: 24,
      })
    ).toBe(false);
    // 作者只写 left:28px、right:auto 时，computed right 是 612px 的剩余值；
    // 原位刚好填满包含块，不能把它误判成页面相对 margin。
    expect(
      shouldKeepContainingBlockMarginsWhenBaseWouldOverflow({
        parentWidth: 1280,
        width: 640,
        marginLeft: 28,
        marginRight: 612,
      })
    ).toBe(false);
    // auto 的已分配余量也不能被误认为作者的百分比布局。
    expect(
      shouldKeepContainingBlockMarginsWhenBaseWouldOverflow({
        parentWidth: 1280,
        width: 640,
        marginLeft: 320,
        marginRight: 320,
      })
    ).toBe(false);
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
