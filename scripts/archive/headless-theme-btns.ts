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
await new Promise<void>((r) => server.listen(8078, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8078/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/测试用epub/【测试专用】记忆的琴键.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2000);

const statusBarInfo = () =>
  page.evaluate(`(() => {
    const sb = document.querySelector(".status-bar");
    return {
      justify: sb ? getComputedStyle(sb).justifyContent : null,
      text: sb ? (sb.textContent ?? "").trim().slice(0, 50) : null,
    };
  })()`);
console.log("状态栏:", JSON.stringify(await statusBarInfo()));

const tbBtnBg = () =>
  page.evaluate(`(() => {
    const b = document.querySelector(".toolbar .tb-btn");
    return b ? getComputedStyle(b).backgroundColor : null;
  })()`);
console.log("顶栏按钮底色:", await tbBtnBg());

// 打开菜单看主题按钮
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
const themes = () =>
  page.evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll(".theme-btn"));
    return btns.map((b) => ({ label: (b.textContent ?? "").trim(), active: b.classList.contains("active") }));
  })()`);
console.log("主题按钮(初始):", JSON.stringify(await themes()));
await page.click('button:has-text("深色")');
await page.waitForTimeout(400);
console.log("主题按钮(点深色后):", JSON.stringify(await themes()));
console.log("根节点主题:", await page.evaluate(`document.querySelector(".app")?.getAttribute("data-theme")`));
await browser.close();
server.close();
