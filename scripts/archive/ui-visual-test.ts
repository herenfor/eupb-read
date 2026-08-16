import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const dist = "/home/herenfor/test/epub-reader/dist";
const server = http.createServer((req, res) => {
  let p = join(dist, req.url === "/" ? "index.html" : (req.url ?? "/").split("?")[0]);
  if (!existsSync(p) || !statSync(p).isFile()) p = join(dist, "index.html");
  const ext = extname(p);
  const type =
    ext === ".js" ? "text/javascript"
    : ext === ".css" ? "text/css"
    : ext === ".html" ? "text/html"
    : "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(p));
});
await new Promise<void>((r) => server.listen(8092, "127.0.0.1", r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:8092/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/测试用epub/【测试专用】记忆的琴键.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2500);

const measure = () =>
  page.evaluate(`(() => {
    const rect = (s) => {
      const e = document.querySelector(s);
      return e ? e.getBoundingClientRect().toJSON() : null;
    };
    return {
      iframe: rect(".reader iframe"),
      toolbarH: rect(".toolbar") ? rect(".toolbar").height : null,
      tocW: rect(".toc-panel") ? rect(".toc-panel").width : null,
      scaleLabel: document.querySelector(".toolbar .page-indicator:nth-of-type(2)")?.textContent,
      fontLabel: document.querySelector(".toolbar .page-indicator")?.textContent,
    };
  })()`);

await page.screenshot({ path: "/home/herenfor/test/hltest/ui-1.png" });
const m1 = await measure();

await page.click('button[title="界面放大"]');
await page.click('button[title="界面放大"]');
await page.waitForTimeout(500);
await page.screenshot({ path: "/home/herenfor/test/hltest/ui-2.png" });
const m2 = await measure();

await page.click('button[title="正文放大"]');
await page.click('button[title="正文放大"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: "/home/herenfor/test/hltest/ui-3.png" });
const m3 = await measure();

console.log("状态1(初始):", JSON.stringify(m1));
console.log("状态2(界面120%):", JSON.stringify(m2));
console.log("状态3(界面120%+正文20px):", JSON.stringify(m3));
await browser.close();
server.close();
