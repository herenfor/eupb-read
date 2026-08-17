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
await new Promise<void>((r) => server.listen(8114, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8114/");
await page.setInputFiles('input[type="file"]', "<PROJECT_ROOT>/测试用epub/[简][鐵人じゅす].原本只是跟全校第一美少女商量彼此挚友的恋爱烦恼，不知不觉间她竟成为我最亲近的存在.01.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2500);

const status = () =>
  page.evaluate(`(() => {
    const el = document.querySelector(".status-bar .sb-progress");
    return el ? (el.textContent ?? "").trim() : "";
  })()`);

// 跳到正文第一章（第 7 条目录项），往前翻到章 2 起始，再回翻
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
await page.click('button:has-text("打开目录")');
await page.waitForTimeout(300);
await page.click(".toc-panel .toc-item >> nth=7"); // 第二章
await page.waitForTimeout(2500);
console.log("第二章起始:", await status());
// 回翻一页 → 应落在第一章最后一页
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(2500);
console.log("回翻后:", await status());
await browser.close();
server.close();
