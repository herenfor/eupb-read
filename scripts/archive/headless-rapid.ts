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
await new Promise<void>((r) => server.listen(8117, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8117/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/测试用epub/[简][鐵人じゅす].原本只是跟全校第一美少女商量彼此挚友的恋爱烦恼，不知不觉间她竟成为我最亲近的存在.01.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2500);
// 注入字体：无头环境无系统字体，否则文字零尺寸、章节只有 1 页
await page.evaluate(`(() => {
  const iframe = document.querySelector(".reader iframe");
  const doc = iframe.contentDocument;
  const style = doc.createElement("style");
  style.textContent = "html{font-size:16px} body,#epub-viewer{font-family:'DejaVu Sans',sans-serif}";
  doc.head.appendChild(style);
})()`);

const status = () =>
  page.evaluate(`(() => {
    const el = document.querySelector(".status-bar .sb-progress");
    return el ? (el.textContent ?? "").trim() : "";
  })()`);

// 跳到 ※亚里莎在意的事（第 8 条 = nth 7）
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
await page.click('button:has-text("打开目录")');
await page.waitForTimeout(300);
await page.click(".toc-panel .toc-item >> nth=8"); // 第二章（多页）
await page.waitForTimeout(2500);
console.log("起点(第二章):", await status());
console.log("目录仍展开:", await page.evaluate(`(() => !!document.querySelector(".toc-panel"))()`));
// 连续两次 ←：第一次进 ※亚里莎（1页），第二次应落在第一章末页（4/4）
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(1500);
console.log("第一次←:", await status());
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(1500);
console.log("第二次←:", await status());
await browser.close();
server.close();
