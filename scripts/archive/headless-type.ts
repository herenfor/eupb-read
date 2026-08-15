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
await new Promise<void>((r) => server.listen(8076, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8076/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/[简][鐵人じゅす].原本只是跟全校第一美少女商量彼此挚友的恋爱烦恼，不知不觉间她竟成为我最亲近的存在.01.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(3000);

const lineHeightOf = () =>
  page.evaluate(`(() => {
    const iframe = document.querySelector(".reader iframe");
    const doc = iframe && iframe.contentDocument;
    const p = doc && doc.querySelector("#epub-viewer p");
    return p ? getComputedStyle(p).lineHeight : null;
  })()`);

// 先跳到正文第一章（第 0 章是封面，无 <p>）
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
await page.click('button:has-text("打开目录")');
await page.waitForTimeout(300);
await page.click(".toc-panel .toc-item >> nth=6");
await page.waitForTimeout(2500);
console.log("初始行高:", await lineHeightOf());
console.log("文档探测:", await page.evaluate(`(() => {
  const iframe = document.querySelector(".reader iframe");
  if (!iframe) return "无iframe";
  const doc = iframe.contentDocument;
  if (!doc) return "无contentDocument";
  const viewer = doc.getElementById("epub-viewer");
  const ps = viewer ? viewer.querySelectorAll("p").length : -1;
  return "viewer=" + !!viewer + " p数=" + ps + " src=" + iframe.src.slice(0, 30);
})()`));
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
// 行高行 = 第 2 个 .menu-row（字号之后）；+ 按钮是该行第 2 个 button
const lhRow = page.locator(".menu-row").nth(1);
console.log("行高当前值:", await lhRow.locator(".menu-value").textContent());
await lhRow.locator("button").nth(1).click();
await page.waitForTimeout(1500);
console.log("点+后值:", await lhRow.locator(".menu-value").textContent());
console.log("点+后行高:", await lineHeightOf());
// 字重行 + 两次 → 粗体
const wRow = page.locator(".menu-row").nth(2);
await wRow.locator("button").nth(1).click();
await wRow.locator("button").nth(1).click();
await page.waitForTimeout(1500);
console.log("字重值:", await wRow.locator(".menu-value").textContent());
console.log("字重:", await page.evaluate(`(() => {
  const doc = document.querySelector(".reader iframe").contentDocument;
  const p = doc.querySelector("#epub-viewer p");
  return p ? getComputedStyle(p).fontWeight : null;
})()`));
await browser.close();
server.close();
