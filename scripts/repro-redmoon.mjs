import { chromium } from "playwright";

const bookPath = "/home/herenfor/test/测试用epub/【测试专用】[赤月ヤモリ].试着向准备跳下去的同班同学提议「和我XX吧！」.02.epub";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (message) => console.log(`[console:${message.type()}] ${message.text()}`));
page.on("pageerror", (error) => console.log(`[pageerror] ${error}`));
await page.goto("http://127.0.0.1:5174/", { waitUntil: "networkidle" });
console.log("before import", (await page.locator("body").innerText()).slice(0, 1000));
await page.locator('input[type="file"]').setInputFiles(bookPath);
await page.waitForTimeout(3000);
console.log("after import", (await page.locator("body").innerText()).slice(0, 1000));
console.log("inputs", await page.locator('input[type="file"]').count(), "iframes", await page.locator('iframe[title="chapter"]').count());
await page.getByText("试着向准备跳下去的同班同学提议「和我XX吧」 02", { exact: true }).click();
await page.waitForSelector('iframe[title="chapter"]', { state: "attached", timeout: 30000 });
await page.waitForFunction(() => {
  const status = document.querySelector(".sb-progress")?.textContent ?? "";
  return /第 \d+\/\d+ 页/.test(status);
}, null, { timeout: 120000 });
await page.waitForTimeout(1000);
console.log("buttons", await page.locator("button").allTextContents());
await page.getByRole("button", { name: "📖" }).click();
await page.waitForTimeout(300);
console.log("toc", (await page.locator("body").innerText()).slice(-1800));
console.log("toc labels", await page.getByText("目录", { exact: true }).count());
await page.getByText("目录", { exact: true }).last().click();
await page.waitForFunction(() => /第 \d+\/\d+ 页/.test(document.querySelector(".sb-progress")?.textContent ?? ""), null, { timeout: 120000 });
await page.waitForTimeout(1000);
const result = await page.locator('iframe[title="chapter"]').evaluate((iframe) => {
  const doc = iframe.contentDocument;
  const win = doc?.defaultView;
  const viewer = doc?.getElementById("epub-viewer");
  if (!doc || !win || !viewer) return { missing: true };
  const target = viewer.querySelector(".ri.ti20er");
  const tcs = target ? win.getComputedStyle(target) : null;
  const rules = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules ?? [])) {
        const text = rule.cssText ?? "";
        if (/ti20er|margin-left: 70%|margin-right: 1\.5em/.test(text)) rules.push(text);
      }
    } catch (error) {
      rules.push(`CSSOM_ERROR:${String(error)}`);
    }
  }
  const rect = target?.getBoundingClientRect();
  return {
    href: location.href,
    status: document.querySelector(".sb-progress")?.textContent,
    viewer: { clientWidth: viewer.clientWidth, clientHeight: viewer.clientHeight, scrollWidth: viewer.scrollWidth, scrollHeight: viewer.scrollHeight, scrollLeft: viewer.scrollLeft },
    target: target && rect && tcs ? {
      className: target.className,
      inline: target.getAttribute("style"),
      rect: { left: rect.left, right: rect.right, width: rect.width, top: rect.top, height: rect.height },
      computed: { width: tcs.width, marginLeft: tcs.marginLeft, marginRight: tcs.marginRight, maxWidth: tcs.maxWidth, display: tcs.display },
      dataFixed: target.getAttribute("data-reader-margin-fixed"),
    } : null,
    sheets: Array.from(doc.styleSheets).map((sheet) => ({ href: sheet.href, rules: (() => { try { return sheet.cssRules?.length ?? -1; } catch { return -2; } })() })),
    rules,
    viewerChildren: Array.from(viewer.children).map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, className: el.className, left: r.left, right: r.right, width: r.width, height: r.height };
    }).slice(-8),
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
