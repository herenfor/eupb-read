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
await new Promise<void>((r) => server.listen(8115, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8115/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/[简][鐵人じゅす].原本只是跟全校第一美少女商量彼此挚友的恋爱烦恼，不知不觉间她竟成为我最亲近的存在.01.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2500);

const status = () =>
  page.evaluate(`(() => {
    const el = document.querySelector(".status-bar .sb-progress");
    return el ? (el.textContent ?? "").trim() : "";
  })()`);

// 跳到第一章（第 6 条），翻到最后一页，再向前进下一章
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
await page.click('button:has-text("打开目录")');
await page.waitForTimeout(300);
await page.click(".toc-panel .toc-item >> nth=6"); // 第一章
await page.waitForTimeout(2500);
console.log("第一章起始:", await status());
// 翻到章末
for (let i = 0; i < 60; i++) {
  const t = await status();
  if (t.includes("页 · 章") && t.split("页 ·")[0].includes("/") && t.split("/")[0].trim().endsWith(t.split("/")[1].split(" ")[0])) break;
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(350);
}
console.log("连续→ 到章末:", await status());
await page.keyboard.press("ArrowRight"); // 进入下一章
await page.waitForTimeout(2500);
console.log("进入下一章:", await status());
await page.keyboard.press("ArrowLeft"); // 回上一章末页
await page.waitForTimeout(2500);
console.log("回翻:", await status());
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(800);
console.log("继续回翻:", await status());
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(800);
console.log("再回翻:", await status());
console.log("锚点健康:", await page.evaluate(`(() => {
  const iframe = document.querySelector(".reader iframe");
  const doc = iframe.contentDocument;
  const viewer = doc.getElementById("epub-viewer");
  return "元素数=" + viewer.querySelectorAll("*").length;
})()`));
await browser.close();
server.close();
