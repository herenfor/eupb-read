import { describe, expect, it } from "vitest";

async function readStyles(): Promise<string> {
  // @ts-expect-error The production project intentionally omits @types/node.
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("../styles.css", import.meta.url), "utf8");
}

describe("书架抽屉布局契约", () => {
  it("滚动区域填满抽屉标题栏以下空间", async () => {
    const styles = await readStyles();
    expect(styles).toMatch(
      /\.shelf-drawer-scroll\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s,
    );
  });

  it("抽屉搜索框保留图标空间并使用固定垂直尺寸", async () => {
    const styles = await readStyles();
    expect(styles).toMatch(
      /\.shelf-drawer-search-wrap \.shelf-drawer-search\s*\{[^}]*width:\s*100%;[^}]*height:\s*42px;[^}]*padding:\s*9px 36px 9px 42px;/s,
    );
    expect(styles).toMatch(
      /\.shelf-drawer-search-icon\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px;[^}]*transform:\s*translateY\(-50%\);/s,
    );
    expect(styles).toMatch(/\.shelf-drawer-search-icon svg\s*\{[^}]*display:\s*block;[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*stroke:\s*currentColor;/s);
  });
});
