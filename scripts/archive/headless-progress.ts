import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const dist = "/home/herenfor/test/epub-reader/dist";
const server = http.createServer((req, res) => {
  let p = join(dist, req.url === "/" ? "index.html" : (req.url ?? "/").split("?")[0]);
  if (!existsSync(p) || !statSync(p).isFile()) p = join(dist, "index.html");
  const ext = extname(p);
  res.writeHead(200, {
    "content-type": ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : ext === ".html" ? "text/html" : "application/octet-stream",
  });
  res.end(readFileSync(p));
});
await new Promise<void>((r) => server.listen(8112, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8112/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/测试用epub/【测试专用】记忆的琴键.epub");
await page.waitForSelector(".status-bar", { timeout: 30000 });
await page.waitForTimeout(1500);

const progressText = () =>
  page.evaluate(`(() => {
    const el = document.querySelector(".status-bar .sb-progress");
    return el ? (el.textContent ?? "").trim() : null;
  })()`);

console.log("初始:", await progressText());
// 翻页到最后一页（该书记忆琴键：3 项 spine，线性 2 章）
for (let i = 0; i < 10; i++) {
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
}
console.log("连续翻页后:", await progressText());
await browser.close();
server.close();
