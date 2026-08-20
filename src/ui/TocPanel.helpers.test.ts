import { describe, expect, it } from "vitest";
import type { TocNode } from "../core/types";
import { countTocNodes, findActiveTocNode } from "./TocPanel";

const item = (label: string, href: string, children: TocNode[] = []): TocNode => ({
  label,
  href,
  children,
});

describe("TocPanel helpers", () => {
  it("递归统计全部目录层级", () => {
    const nodes = [
      item("章", "OEBPS/ch.xhtml", [
        item("节", "OEBPS/ch.xhtml#s1", [item("小节", "OEBPS/ch.xhtml#s2")]),
      ]),
      item("后记", "OEBPS/end.xhtml"),
    ];
    expect(countTocNodes(nodes)).toBe(4);
  });

  it("fragment 精确匹配优先", () => {
    const root = item("章首", "OEBPS/ch.xhtml", [
      item("小节一", "OEBPS/ch.xhtml#s1"),
      item("小节二", "OEBPS/ch.xhtml#s2"),
    ]);
    expect(findActiveTocNode([root], "OEBPS/ch.xhtml#s2")?.label).toBe("小节二");
  });

  it("没有精确 fragment 时优先章首，同路径始终只返回一个引用", () => {
    const first = item("同路径第一项", "OEBPS/ch.xhtml#missing");
    const root = item("章首", "OEBPS/ch.xhtml", [first, item("另一节", "OEBPS/ch.xhtml#s2")]);
    expect(findActiveTocNode([root], "OEBPS/ch.xhtml#unknown")).toBe(root);
    expect(findActiveTocNode([root], "OEBPS/ch.xhtml")).toBe(root);
  });
});
