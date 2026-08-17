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
await new Promise<void>((r) => server.listen(8081, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8081/");
await page.setInputFiles('input[type="file"]', "<PROJECT_ROOT>/测试用epub/[简][鐵人じゅす].原本只是跟全校第一美少女商量彼此挚友的恋爱烦恼，不知不觉间她竟成为我最亲近的存在.01.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(3000);

const sbText = (): Promise<string> =>
  page.evaluate(() => document.querySelector(".status-bar .sb-progress")?.textContent ?? "");

console.log("状态栏:", (await sbText()).trim());
console.log("初始目录状态:", await page.evaluate(() => (document.querySelector(".toc-panel") ? "开" : "收")));
// 打开目录检查悬浮层
await page.click('button:has-text("目录")');
await page.waitForTimeout(300);
console.log("打开目录后:", await page.evaluate(() => {
  const panel = document.querySelector(".toc-panel") as HTMLElement | null;
  const backdrop = document.querySelector(".toc-backdrop") as HTMLElement | null;
  return panel ? `面板=${getComputedStyle(panel).position} 遮罩=${!!backdrop}` : "无";
}));
// 点击目录条目应关闭面板并跳转
await page.click(".toc-panel .toc-item");
await page.waitForTimeout(1200);
console.log("点击条目后面板:", await page.evaluate(() => (document.querySelector(".toc-panel") ? "仍开" : "已收起")));

// 滚轮翻页：先把鼠标移到阅读区，往下滚两格
const readerBox = await page.locator(".reader").boundingBox();
await page.mouse.move(readerBox!.x + readerBox!.width / 2, readerBox!.y + readerBox!.height / 2);
const before = await sbText();
await page.mouse.wheel(0, 200);
await page.waitForTimeout(600);
await page.mouse.wheel(0, 200);
await page.waitForTimeout(600);
const after = await sbText();
console.log("滚轮前:", before.trim());
console.log("滚轮后:", after.trim());
await browser.close();
server.close();
