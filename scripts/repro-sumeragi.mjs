import { chromium } from "playwright";

const bookPath = "/home/herenfor/test/测试用epub/【测试专用】[すめらぎひよこ].世界啊臣服于吾之火焰.01.试着把魔王城点了.epub";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: Number(process.env.VIEW_W ?? 1280), height: Number(process.env.VIEW_H ?? 800) } });
page.on("console", (message) => console.log(`[console:${message.type()}] ${message.text()}`));
page.on("pageerror", (error) => console.log(`[pageerror] ${error}`));
await page.goto(`http://127.0.0.1:${process.env.VITE_PORT ?? 5174}/`, { waitUntil: "networkidle" });
await page.locator('input[type="file"]').setInputFiles(bookPath);
await page.waitForTimeout(2500);
console.log("after import", (await page.locator("body").innerText()).slice(0, 1800));
const shelfBook = page.locator(".shelf-card").first();
if (await shelfBook.count()) await shelfBook.click();
await page.waitForSelector('iframe[title="chapter"]', { state: "attached", timeout: 30000 });
await page.waitForFunction(() => /第 \d+\/\d+ 页/.test(document.querySelector(".sb-progress")?.textContent ?? ""), null, { timeout: 120000 });
await page.waitForTimeout(800);
const tocButton = page.getByRole("button", { name: "📖" });
if (await tocButton.count()) await tocButton.click();
else await page.getByRole("button", { name: "☰" }).click();
await page.waitForTimeout(250);
console.log("menu", (await page.locator("body").innerText()).slice(-1200));
await page.getByText("目录", { exact: true }).last().click();
await page.waitForFunction(() => /第 \d+\/\d+ 页/.test(document.querySelector(".sb-progress")?.textContent ?? ""), null, { timeout: 120000 });
await page.waitForTimeout(1000);
console.log("after nav entry", await page.locator(".sb-progress").textContent());
await page.keyboard.press("ArrowRight");
await page.waitForFunction(() => /章 9\/20/.test(document.querySelector(".sb-progress")?.textContent ?? ""), null, { timeout: 120000 });
await page.waitForTimeout(1000);
const result = await page.locator('iframe[title="chapter"]').evaluate((iframe) => {
  const doc = iframe.contentDocument;
  const win = doc?.defaultView;
  const viewer = doc?.getElementById("epub-viewer");
  if (!doc || !win || !viewer) return { missing: true };
  const info = (el) => {
    const cs = win.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      className: el.className,
      text: (el.textContent ?? "").trim().slice(0, 120),
      rect: { left: r.left, right: r.right, width: r.width, top: r.top, height: r.height },
      computed: {
        display: cs.display, position: cs.position, width: cs.width,
        maxWidth: cs.maxWidth, marginLeft: cs.marginLeft, marginRight: cs.marginRight,
        paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight,
        textAlign: cs.textAlign, textIndent: cs.textIndent, whiteSpace: cs.whiteSpace,
        wordSpacing: cs.wordSpacing, letterSpacing: cs.letterSpacing,
        fontSize: cs.fontSize, lineHeight: cs.lineHeight,
      },
      inline: el.getAttribute("style"),
      dataFixed: el.getAttribute("data-reader-margin-fixed"),
      inlineBoxFixed: el.getAttribute("data-reader-inline-box-fixed"),
      tail: Array.from((el.textContent ?? "").slice(-6)).map((c) => `U+${c.codePointAt(0)?.toString(16)}`),
    };
  };
  const rules = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules ?? [])) {
        const text = rule.cssText ?? "";
        if (/ctit|tbox|reader-top|epub-viewer/.test(text)) rules.push(text);
      }
    } catch (error) { rules.push(`CSSOM_ERROR:${String(error)}`); }
  }
  return {
    status: document.querySelector(".sb-progress")?.textContent,
    viewport: { width: iframe.clientWidth, height: iframe.clientHeight },
    viewer: { clientWidth: viewer.clientWidth, clientHeight: viewer.clientHeight, scrollWidth: viewer.scrollWidth, scrollHeight: viewer.scrollHeight, scrollLeft: viewer.scrollLeft },
    body: info(doc.body),
    children: Array.from(viewer.children).map(info),
    nested: Array.from(viewer.querySelectorAll("a, p, .tbox, .tbox1")).slice(0, 15).map(info),
    tocHtml: viewer.querySelector(".ctit")?.outerHTML,
    matched: Array.from(viewer.querySelectorAll(".ctit, .ctit a, .ctit p, .ctit span")).slice(0, 8).map((el) => ({
      tag: el.tagName,
      className: el.className,
      text: (el.textContent ?? "").trim().slice(0, 60),
      rules: Array.from(doc.styleSheets).flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules ?? []).flatMap((rule) => {
            const styleRule = rule;
            if (typeof styleRule.selectorText !== "string") return [];
            try { return el.matches(styleRule.selectorText) ? [styleRule.cssText] : []; }
            catch { return []; }
          });
        } catch { return []; }
      }),
    })),
    layoutRects: Array.from(viewer.querySelectorAll(".ctit, .ctit > a, .ctit > a > p, .ctit > a > p > span")).map((el) => ({
      tag: el.tagName, className: el.className, text: (el.textContent ?? "").trim().slice(0, 80),
      rects: Array.from(el.getClientRects()).map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height })),
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
    })),
    rules,
  };
});
if (process.env.ONLY_VARIANTS !== "1") console.log(JSON.stringify(result, null, 2));
if (process.env.FINAL_VERIFY === "1") {
  const summary = async () => page.locator('iframe[title="chapter"]').evaluate((iframe) => {
    const doc = iframe.contentDocument;
    const viewer = doc?.getElementById("epub-viewer");
    if (!doc || !viewer) return { missing: true };
    return {
      status: document.querySelector(".sb-progress")?.textContent,
      scrollWidth: viewer.scrollWidth,
      clientWidth: viewer.clientWidth,
      boxes: Array.from(doc.querySelectorAll(".tbox, .tbox1")).map((el) => {
        const parent = el.parentElement;
        const rect = el.getBoundingClientRect();
        const parentRect = parent?.getBoundingClientRect();
        return { right: rect.right, width: rect.width, parentRight: parentRect?.right, fixed: el.getAttribute("data-reader-inline-box-fixed") };
      }),
    };
  });
  console.log("final-before-resize", JSON.stringify(await summary()));
  await page.setViewportSize({ width: Number(process.env.VIEW_W ?? 1280) + 1, height: Number(process.env.VIEW_H ?? 800) });
  await page.waitForTimeout(1400);
  console.log("final-after-resize", JSON.stringify(await summary()));
  if (/1\/2/.test((await page.locator(".sb-progress").textContent()) ?? "")) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    console.log("final-page-two", JSON.stringify(await summary()));
  }
  await browser.close();
  process.exit(0);
}
const variants = await page.locator('iframe[title="chapter"]').evaluate((iframe) => {
  const doc = iframe.contentDocument;
  if (!doc) return { missing: true };
  const measure = () => Array.from(doc.querySelectorAll(".ctit p.co1")).slice(1).map((p) => {
    const child = p.querySelector(".tbox, .tbox1");
    const pr = p.getBoundingClientRect();
    const cr = child?.getBoundingClientRect();
    return { pRight: pr.right, childLeft: cr?.left, childRight: cr?.right, overflow: cr ? cr.right - pr.right : null };
  });
  const out = { original: measure() };
  for (const p of doc.querySelectorAll(".ctit p.co1")) p.style.setProperty("text-indent", "0", "important");
  out.noIndent = measure();
  for (const child of doc.querySelectorAll(".ctit .tbox, .ctit .tbox1")) child.style.setProperty("display", "inline-block", "important");
  out.noIndentInlineBlock = measure();
  for (const p of doc.querySelectorAll(".ctit p.co1")) p.style.removeProperty("text-indent");
  out.inlineBlock = measure();
  for (const child of doc.querySelectorAll(".ctit .tbox, .ctit .tbox1")) child.style.setProperty("text-indent", "0", "important");
  out.inlineBlockChildNoIndent = measure();
  return out;
});
console.log("variants", JSON.stringify(variants, null, 2));
if (process.env.ONLY_VARIANTS === "1") {
  await browser.close();
  process.exit(0);
}
await page.screenshot({ path: "/tmp/sumeragi-toc-current.png" });
const probe = await page.locator('iframe[title="chapter"]').evaluate((iframe) => {
  const doc = iframe.contentDocument;
  const win = doc?.defaultView;
  if (!doc || !win) return null;
  return Array.from(doc.querySelectorAll(".tbox, .tbox1")).slice(0, 4).map((el) => {
    const parent = el.parentElement;
    const before = el.getBoundingClientRect();
    const pBefore = parent?.getBoundingClientRect();
    const cs = win.getComputedStyle(el);
    el.style.setProperty("display", "inline-block", "important");
    el.style.setProperty("text-indent", "0", "important");
    void el.offsetWidth;
    const after = el.getBoundingClientRect();
    const pAfter = parent?.getBoundingClientRect();
    return { before: {left: before.left, right: before.right, width: before.width}, pBefore: pBefore && {left:pBefore.left,right:pBefore.right,width:pBefore.width}, after: {left: after.left,right:after.right,width:after.width}, pAfter: pAfter && {left:pAfter.left,right:pAfter.right,width:pAfter.width}, display: cs.display, bg: cs.backgroundColor, padding: [cs.paddingLeft,cs.paddingRight] };
  });
});
console.log("probe", JSON.stringify(probe, null, 2));
const relaxed = await page.locator('iframe[title="chapter"]').evaluate((iframe) => {
  const doc = iframe.contentDocument;
  const win = doc?.defaultView;
  const viewer = doc?.getElementById("epub-viewer");
  if (!doc || !win || !viewer) return { missing: true };
  for (const el of Array.from(viewer.children)) {
    el.style.removeProperty("margin-left");
    el.style.removeProperty("margin-right");
    el.style.setProperty("max-width", "none", "important");
  }
  void viewer.scrollWidth;
  return {
    scrollWidth: viewer.scrollWidth,
    children: Array.from(viewer.children).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = win.getComputedStyle(el);
      return { className: el.className, left: r.left, right: r.right, width: r.width, height: r.height, computedWidth: cs.width, maxWidth: cs.maxWidth };
    }),
  };
});
console.log("relaxed", JSON.stringify(relaxed, null, 2));
await page.setViewportSize({ width: Number(process.env.VIEW_W ?? 1280) + 1, height: Number(process.env.VIEW_H ?? 800) });
await page.waitForTimeout(1200);
console.log("relaxed status", await page.locator(".sb-progress").textContent());
await page.screenshot({ path: "/tmp/sumeragi-toc.png" });
await browser.close();
