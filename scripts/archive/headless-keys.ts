import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const dist = "<PROJECT_ROOT>/epub-reader/dist";
const server = http.createServer((req, res) => {
  let p = join(dist, req.url === "/" ? "index.html" : (req.url ?? "/").split("?")[0]);
  if (!existsSync(p) || !statSync(p).isFile()) p = join(dist, "index.html");
  const ext = extname(p);
  res.writeHead(200, {
    "content-type": ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : ext === ".html" ? "text/html" : "application/octet-stream",
  });
  res.end(readFileSync(p));
});
await new Promise<void>((r) => server.listen(8113, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8113/");
await page.setInputFiles('input[type="file"]', "<PROJECT_ROOT>/测试用epub/【测试专用】记忆的琴键.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2000);

const prog = () =>
  page.evaluate(`(() => document.querySelector(".status-bar .sb-progress")?.textContent ?? "")()`);
console.log("初始:", (await prog()).trim());

// 关键场景：点击书页内部（焦点进入 iframe）后按方向键
await page.frameLocator(".reader iframe").locator("#epub-viewer").click({ position: { x: 200, y: 200 } });
await page.waitForTimeout(300);
console.log("焦点:", await page.evaluate(`document.activeElement?.tagName`));
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(600);
console.log("书页内焦点按 → 后:", (await prog()).trim());
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(600);
console.log("按 ← 后:", (await prog()).trim());

// 先跳到正文第一章（記憶的琴键只有封面/标题两页，无正文 p）
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
await page.click('button:has-text("打开目录")');
await page.waitForTimeout(300);
const items = page.locator(".toc-panel .toc-item");
const n = await items.count();
if (n > 1) { await items.nth(n - 1).click(); await page.waitForTimeout(1500); }
// 行宽比例检查：正文页块宽 ≈ 40em
const widthCheck = await page.evaluate(`(() => {
  const doc = document.querySelector(".reader iframe").contentDocument;
  const p = doc.querySelector("#epub-viewer p");
  if (!p) return null;
  const w = p.getBoundingClientRect().width;
  const fs = parseFloat(getComputedStyle(doc.documentElement).fontSize);
  return { width: Math.round(w), em: Math.round((w / fs) * 10) / 10 };
})()`);
console.log("正文字块:", JSON.stringify(widthCheck));
await browser.close();
server.close();
