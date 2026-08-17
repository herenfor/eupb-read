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
await new Promise<void>((r) => server.listen(8111, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8111/");
await page.setInputFiles('input[type="file"]', "<PROJECT_ROOT>/测试用epub/【测试专用】记忆的琴键.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2000);

// 目录标题栏
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
await page.click('button:has-text("打开目录")');
await page.waitForTimeout(400);
console.log("目录标题栏:", await page.evaluate(`(() => {
  const h = document.querySelector(".toc-head");
  if (!h) return "无";
  return (h.textContent ?? "").trim().replace(/\\s+/g, " ");
})()`));

// 调整字号 + 界面档位后重置
await page.click(".toc-backdrop");
await page.waitForTimeout(300);
// 重新打开菜单（打开目录时菜单已关闭）
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
const sizeRow = page.locator(".slider-row").nth(0);
await sizeRow.locator(".step-btn").nth(1).click();
await sizeRow.locator(".step-btn").nth(1).click();
await page.waitForTimeout(1200);
console.log("调整后字号值:", await sizeRow.locator(".slider-value").textContent());
await page.click('button:has-text("恢复默认设置")');
await page.waitForTimeout(1200);
console.log("重置后字号值:", await sizeRow.locator(".slider-value").textContent());
console.log("重置后主题激活:", await page.evaluate(`(() => {
  const btns = Array.from(document.querySelectorAll(".theme-btn"));
  return btns.filter((b) => b.classList.contains("active")).map((b) => (b.textContent ?? "").trim()).join(",");
})()`));
await browser.close();
server.close();
