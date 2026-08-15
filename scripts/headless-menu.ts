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
await new Promise<void>((r) => server.listen(8079, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8079/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/【测试专用】记忆的琴键.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2500);

const q = (sel: string) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    return el ? (el.textContent ?? "").trim().slice(0, 40) : null;
  })()`);

console.log("顶栏书名:", await q(".tb-title"));
console.log("底部左侧(章节):", await q(".status-bar .sb-title"));
console.log("底部右侧(进度):", await q(".status-bar .sb-progress"));
console.log("翻页按钮存在:", await page.evaluate(`!!document.querySelector('button[title*="上一页"]')`));

await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
console.log("菜单面板:", await page.evaluate(`(() => {
  const m = document.querySelector(".menu-panel");
  const b = document.querySelector(".menu-backdrop");
  return m ? "宽=" + m.getBoundingClientRect().width + "px 遮罩=" + !!b : "无";
})()`));
console.log("菜单分区:", await q(".menu-section"));
await page.click('button:has-text("打开目录")');
await page.waitForTimeout(300);
console.log("菜单打开目录后:", await page.evaluate(`(() => "目录面板=" + !!document.querySelector(".toc-panel") + " 菜单已关=" + !document.querySelector(".menu-panel"))()`));
console.log("诊断按钮存在:", await page.evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    return btns.some((b) => (b.textContent ?? "").includes("诊断"));
  })()`));
await browser.close();
server.close();
