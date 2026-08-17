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
await new Promise<void>((r) => server.listen(8116, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8116/");
await page.setInputFiles('input[type="file"]', "<PROJECT_ROOT>/测试用epub/[简][鐵人じゅす].原本只是跟全校第一美少女商量彼此挚友的恋爱烦恼，不知不觉间她竟成为我最亲近的存在.01.epub");
await page.waitForSelector(".reader iframe", { timeout: 30000 });
await page.waitForTimeout(2500);

// 跳到 ※亚里莎在意的事（p-002，目录第 8 条 = nth 7）
await page.click(".toolbar .tb-btn >> nth=0");
await page.waitForTimeout(300);
await page.click('button:has-text("打开目录")');
await page.waitForTimeout(300);
await page.click(".toc-panel .toc-item >> nth=7");
await page.waitForTimeout(2500);

// 标记图标尺寸
console.log("标记图标:", await page.evaluate(`(() => {
  const doc = document.querySelector(".reader iframe").contentDocument;
  const img = doc.querySelector("sup img, .duokan-footnote img, .zhangyue-footnote img");
  if (!img) return "无";
  const r = img.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(doc.documentElement).fontSize);
  return Math.round(r.width) + "x" + Math.round(r.height) + " (em:" + (r.height / fs).toFixed(2) + ")";
})()`));
// aside 是否隐藏
console.log("aside 隐藏:", await page.evaluate(`(() => {
  const doc = document.querySelector(".reader iframe").contentDocument;
  const aside = doc.querySelector("aside");
  return aside ? getComputedStyle(aside).display : "无aside";
})()`));
// 点击标记（在 iframe 内派发点击）
const clicked = await page.evaluate(`(() => {
  const iframe = document.querySelector(".reader iframe");
  const doc = iframe.contentDocument;
  const marker = doc.querySelector("sup a, a.duokan-footnote, a[epub\\\\:type='noteref']");
  if (!marker) return "无标记";
  marker.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return "已点击";
})()`);
console.log("点击标记:", clicked);
await page.waitForTimeout(600);
console.log("弹层内容:", await page.evaluate(`(() => {
  const el = document.querySelector(".footnote-text");
  return el ? (el.textContent ?? "").trim() : "无弹层";
})()`));
// 弹层位置（应锚定标记右上方）
console.log("弹层定位:", await page.evaluate(`(() => {
  const card = document.querySelector(".footnote-card");
  if (!card) return "无弹层";
  const c = card.getBoundingClientRect();
  const main = document.querySelector(".main").getBoundingClientRect();
  return { left: Math.round(c.left - main.left), top: Math.round(c.top - main.top), w: Math.round(c.width) };
})()`));
// 窗口缩放后弹层应重新定位
await page.setViewportSize({ width: 1100, height: 800 });
await page.waitForTimeout(1200);
console.log("缩放后定位:", await page.evaluate(`(() => {
  const card = document.querySelector(".footnote-card");
  if (!card) return "已关";
  const c = card.getBoundingClientRect();
  const main = document.querySelector(".main").getBoundingClientRect();
  return { left: Math.round(c.left - main.left), top: Math.round(c.top - main.top) };
})()`));
// ✕ 关闭
await page.click(".footnote-head .tb-btn");
await page.waitForTimeout(300);
console.log("关闭后:", await page.evaluate(`(() => (document.querySelector(".footnote-pop") ? "仍开" : "已关"))()`));
await browser.close();
server.close();
