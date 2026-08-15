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
await new Promise<void>((r) => server.listen(8091, "127.0.0.1", r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:8091/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/【测试专用】记忆的琴键.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2000);

const snap = () =>
  page.evaluate(`(() => {
    const iframe = document.querySelector(".reader iframe");
    const doc = iframe && iframe.contentDocument;
    const htmlFs = doc ? getComputedStyle(doc.documentElement).fontSize : null;
    const viewerCw = doc && doc.getElementById("epub-viewer") ? doc.getElementById("epub-viewer").clientWidth : null;
    const uiBtnFs = getComputedStyle(document.querySelector(".toolbar button")).fontSize;
    return { bookFontPx: htmlFs, viewerClientWidth: viewerCw, uiButtonFontPx: uiBtnFs };
  })()`);

console.log("状态1 初始:", JSON.stringify(await snap()));
await page.click('button[title="正文放大"]');
await page.click('button[title="正文放大"]');
await page.waitForTimeout(1500);
console.log("状态2 正文A+两次(20px):", JSON.stringify(await snap()));
await page.click('button[title="界面放大"]');
await page.waitForTimeout(600);
console.log("状态3 界面110%:", JSON.stringify(await snap()));
await browser.close();
server.close();
