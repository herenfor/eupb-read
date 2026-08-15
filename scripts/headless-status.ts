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
await new Promise<void>((r) => server.listen(8077, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8077/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/【测试专用】记忆的琴键.epub");
await page.waitForSelector(".status-bar", { timeout: 30000 });
await page.waitForTimeout(1500);
console.log(await page.evaluate(`(() => {
  const sb = document.querySelector(".status-bar");
  const clock = document.querySelector(".sb-clock");
  const title = document.querySelector(".sb-title");
  const progress = document.querySelector(".sb-progress");
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), width: Math.round(r.width) };
  };
  return {
    时钟: clock ? clock.textContent.trim() : null,
    时钟正则: /^\\d{2}:\\d{2}$/.test(clock ? clock.textContent.trim() : ""),
    章节: title ? title.textContent.trim().slice(0, 20) : null,
    章节居中: title ? Math.abs((rect(title).left + rect(title).width / 2) - (rect(sb).left + rect(sb).width / 2)) < 4 : null,
    进度: progress ? progress.textContent.trim().slice(0, 30) : null,
    进度在右: progress ? rect(progress).left + rect(progress).width > rect(sb).left + rect(sb).width - 50 : null,
    布局: getComputedStyle(sb).justifyContent,
  };
})()`));
await browser.close();
server.close();
