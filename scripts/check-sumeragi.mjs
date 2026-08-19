import { chromium } from "playwright";

const port = process.env.VITE_PORT ?? "5174";
const width = Number(process.env.VIEW_W ?? 1280);
const height = Number(process.env.VIEW_H ?? 800);
const bookPath = "/home/herenfor/test/测试用epub/【测试专用】[すめらぎひよこ].世界啊臣服于吾之火焰.01.试着把魔王城点了.epub";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width, height } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.locator('input[type="file"]').setInputFiles(bookPath);
await page.waitForTimeout(2500);
const shelf = page.locator(".shelf-card").first();
if (await shelf.count()) await shelf.click();
await page.waitForSelector('iframe[title="chapter"]', { state: "attached", timeout: 30000 });
await page.waitForFunction(() => /第 \d+\/\d+ 页/.test(document.querySelector(".sb-progress")?.textContent ?? ""), null, { timeout: 120000 });
await page.waitForTimeout(2200);
const toc = page.getByRole("button", { name: "📖" });
if (await toc.count()) await toc.click();
else await page.getByRole("button", { name: "☰" }).click();
await page.waitForTimeout(250);
await page.locator(".toc-item").filter({ hasText: "目录" }).click();
await page.waitForFunction(() => /第 \d+\/\d+ 页/.test(document.querySelector(".sb-progress")?.textContent ?? ""), null, { timeout: 120000 });
await page.waitForTimeout(2500);
const hasTargetToc = await page.locator('iframe[title="chapter"]').evaluate((iframe) =>
  Boolean(iframe.contentDocument?.querySelector(".ctit"))
);
if (!hasTargetToc) {
  await page.locator('iframe[title="chapter"]').evaluate((iframe) => {
    iframe.contentDocument?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  await page.waitForTimeout(2500);
}
const result = await page.locator('iframe[title="chapter"]').evaluate((iframe) => {
  const doc = iframe.contentDocument;
  const win = doc?.defaultView;
  const viewer = doc?.getElementById("epub-viewer");
  if (!doc || !win || !viewer) return { missing: true };
  const boxes = Array.from(viewer.querySelectorAll(".ctit p.co1 > .tbox, .ctit p.co1 > .tbox1")).map((el) => {
    const r = el.getBoundingClientRect();
    const p = el.parentElement?.getBoundingClientRect();
    const cs = win.getComputedStyle(el);
    return {
      text: (el.textContent ?? "").trim().slice(0, 24),
      tail: Array.from((el.textContent ?? "").slice(-4)).map((c) => c.codePointAt(0)?.toString(16)),
      rect: { left: r.left, right: r.right, width: r.width },
      parent: p && { left: p.left, right: p.right, width: p.width },
      display: cs.display,
      textIndent: cs.textIndent,
      fixed: el.getAttribute("data-reader-inline-box-fixed"),
    };
  });
  return {
    status: document.querySelector(".sb-progress")?.textContent,
    viewer: { clientWidth: viewer.clientWidth, scrollWidth: viewer.scrollWidth, scrollHeight: viewer.scrollHeight, clientHeight: viewer.clientHeight },
    boxes,
    reachableLast: boxes.at(-1),
    children: Array.from(viewer.children).map((el) => ({ className: el.className, rect: (() => { const r = el.getBoundingClientRect(); return { left:r.left,right:r.right,width:r.width,height:r.height}; })() })),
  };
});
console.log(JSON.stringify(result, null, 2));
await page.setViewportSize({ width: width + 1, height });
await page.waitForTimeout(2200);
const reflow = await page.locator('iframe[title="chapter"]').evaluate((iframe) => {
  const doc = iframe.contentDocument;
  if (!doc) return { missing: true };
  const fixed = doc.querySelectorAll("[data-reader-inline-box-fixed]").length;
  const first = doc.querySelector(".ctit p.co1 > .tbox, .ctit p.co1 > .tbox1");
  const rect = first?.getBoundingClientRect();
  return {
    fixed,
    first: rect && { right: rect.right, width: rect.width },
    status: document.querySelector(".sb-progress")?.textContent,
  };
});
console.log("after resize", JSON.stringify(reflow));
await page.locator('iframe[title="chapter"]').evaluate((iframe) => {
  iframe.contentDocument?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
});
await page.waitForTimeout(500);
console.log("after next", await page.locator(".sb-progress").textContent());
await browser.close();
