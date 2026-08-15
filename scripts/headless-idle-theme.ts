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
await new Promise<void>((r) => server.listen(8082, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:8082/");
await page.waitForSelector(".placeholder", { timeout: 30000 });
await page.waitForTimeout(500);
const measure = () =>
  page.evaluate(`(() => {
    const main = document.querySelector(".main");
    const app = document.querySelector(".app");
    const ph = document.querySelector(".placeholder");
    return {
      mainBg: main ? getComputedStyle(main).backgroundColor : null,
      appBg: app ? getComputedStyle(app).backgroundColor : null,
      placeholderText: ph ? getComputedStyle(ph).color : null,
    };
  })()`);
console.log("浅色:", JSON.stringify(await measure()));
await page.click('button[title="切换主题"]');
await page.click('button[title="切换主题"]');
await page.waitForTimeout(300);
console.log("深色:", JSON.stringify(await measure()));
await browser.close();
server.close();
