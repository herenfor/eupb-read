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
await new Promise<void>((r) => server.listen(8083, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:8083/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/【测试专用】记忆的琴键.epub");
await page.waitForSelector(".toc-panel .toc-item", { timeout: 30000 });
await page.waitForTimeout(1200);
const colors = () =>
  page.evaluate(`(() => {
    const item = document.querySelector(".toc-panel .toc-item");
    const panel = document.querySelector(".toc-panel");
    const toolbarBtn = document.querySelector(".toolbar button");
    const title = document.querySelector(".toolbar .title");
    const bg = getComputedStyle(document.body).backgroundColor;
    return {
      tocItemColor: item ? getComputedStyle(item).color : null,
      tocPanelColor: panel ? getComputedStyle(panel).color : null,
      toolbarBtnColor: toolbarBtn ? getComputedStyle(toolbarBtn).color : null,
      titleColor: title ? getComputedStyle(title).color : null,
      bodyBg: bg,
    };
  })()`);
console.log("浅色:", JSON.stringify(await colors()));
await page.click('button[title="切换主题"]');
await page.click('button[title="切换主题"]');
await page.waitForTimeout(300);
console.log("深色:", JSON.stringify(await colors()));
await browser.close();
server.close();
