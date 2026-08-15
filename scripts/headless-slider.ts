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
await new Promise<void>((r) => server.listen(8075, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8075/");
await page.setInputFiles('input[type="file"]', "/home/herenfor/test/【测试专用】记忆的琴键.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2000);
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(400);
console.log("滑块行数(现应5个):", await page.evaluate(`document.querySelectorAll(".slider-row").length`));
console.log("界面缩放按钮:", await page.evaluate(`(() => {
  const rows = Array.from(document.querySelectorAll(".theme-row"));
  const scaleRow = rows[0];
  return Array.from(scaleRow.querySelectorAll(".theme-btn")).map((b) => ({
    label: (b.textContent ?? "").trim(),
    active: b.classList.contains("active"),
  }));
})()`));
console.log("−按钮尺寸:", await page.evaluate(`(() => {
  const b = document.querySelector(".step-btn");
  const r = b.getBoundingClientRect();
  return Math.round(r.width) + "x" + Math.round(r.height);
})()`));
// 行高滑块拖动：设置 value 后触发 input/change
const lhSlider = page.locator(".slider-row").nth(1).locator('input[type="range"]');
// 先用 + 按钮验证行切换
await page.locator(".slider-row").nth(1).locator(".step-btn").nth(1).click();
await page.waitForTimeout(1200);
console.log("点+后行高值:", await page.locator(".slider-row").nth(1).locator(".slider-value").textContent());
console.log("input 当前 value:", await lhSlider.inputValue());
await lhSlider.evaluate(`(el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "2.0");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}`);
await page.waitForTimeout(1500);
console.log("拖动后行高值:", await page.locator(".slider-row").nth(1).locator(".slider-value").textContent());
console.log("书内行高:", await page.evaluate(`(() => {
  const doc = document.querySelector(".reader iframe").contentDocument;
  const p = doc.querySelector("#epub-viewer p, #epub-viewer h4");
  return p ? getComputedStyle(p).lineHeight : null;
})()`));
await browser.close();
server.close();
