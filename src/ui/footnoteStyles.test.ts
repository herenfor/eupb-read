import { describe, expect, it } from "vitest";

async function readStyles(): Promise<string> {
  // The production bundle handles CSS through Vite; this node-only contract
  // test reads the source text so the selector boundary itself is covered.
  // @ts-expect-error The project intentionally does not include @types/node.
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("../styles.css", import.meta.url), "utf8");
}

describe("脚注弹层富内容样式", () => {
  it("只隐藏多看脚注列表的生成编号并清除其左侧缩进", async () => {
    const styles = await readStyles();
    expect(styles).toMatch(
      /\.footnote-html ol\.duokan-footnote-content,\s*\.footnote-html ol\.duokan-footnote-content > li\s*\{[^}]*list-style:\s*none;/s
    );
    expect(styles).toMatch(
      /\.footnote-html ol\.duokan-footnote-content\s*\{[^}]*padding-left:\s*0;/s
    );
    expect(styles).toMatch(
      /\.footnote-html ol\.duokan-footnote-content > li > div:has\(> img\)\s*\{[^}]*margin-left:\s*0;/s
    );
  });

  it("不改变普通 footnote ol/ul 的编号和图片缩进契约", async () => {
    const styles = await readStyles();
    const genericList = styles.match(
      /\.footnote-html ol,\s*\.footnote-html ul\s*\{([^}]*)\}/s
    )?.[1];
    expect(genericList).toContain("padding-left: 20px;");
    expect(genericList).not.toContain("list-style: none");
    expect(styles).toMatch(
      /\.footnote-html li div:has\(> img\)\s*\{[^}]*margin-left:\s*-20px;/s
    );
  });
});
