// 复现：渲染《无双.04》Section03，测量全屏图 p034 与分隔图 kugiri 的实际渲染盒。
// 用法: LD_LIBRARY_PATH=... PLAYWRIGHT_BROWSERS_PATH=... npx tsx scripts/img-repro.ts
import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loadBook, spineItemPath } from "../src/core/book";
import { sanitizeChapter } from "../src/render/sanitize";
import { ResourceServer } from "../src/render/resources";
import { DEFAULT_SETTINGS } from "../src/render/settings";

const EPUB = "/home/herenfor/test/[简][七菜なな].能够率直说出喜欢的女生无双.04.epub";
const OUT = "/tmp/imgtest";

const bytes = new Uint8Array(readFileSync(EPUB));
const book = await loadBook(bytes);
const srv = new ResourceServer(book);
console.log("version:", book.version, "spine:", book.spine.length);
console.log("sample hrefs:", book.spine.slice(0, 6).map((i) => i.href).join(", "));

const path = book.spine
  .map((_, i) => spineItemPath(book, i))
  .find((p) => (p ?? "").includes("Section03"));
if (!path) throw new Error("Section03 not found");
console.log("chapter:", path);

// 静态资源服务器：路径与书内一致
const server = http.createServer((req, res) => {
  const p = `${OUT}${req.url === "/ch.html" ? "/ch.html" : req.url}`;
  try {
    const data = readFileSync(p);
    const ct = p.endsWith(".html")
      ? "text/html"
      : p.endsWith(".webp")
        ? "image/webp"
        : p.endsWith(".css")
          ? "text/css"
          : "application/octet-stream";
    res.writeHead(200, { "content-type": ct });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(8113, "127.0.0.1", r));

mkdirSync(`${OUT}/res/OEBPS/Images`, { recursive: true });
mkdirSync(`${OUT}/res/OEBPS/Styles`, { recursive: true });
// 图片与样式表按原始路径落盘（sanitize 会把 src 重写到 urlFor 返回的 URL）
for (const img of ["kugiri.webp", "p034.webp"]) {
  const b = book.resources.get(`OEBPS/Images/${img}`)?.data;
  if (b) writeFileSync(`${OUT}/res/OEBPS/Images/${img}`, b);
}
for (const css of ["stylesheet.css", "default.css", "necessary.css"]) {
  const b = book.resources.get(`OEBPS/Styles/${css}`)?.data;
  if (b) writeFileSync(`${OUT}/res/OEBPS/Styles/${css}`, b);
}

const result = await sanitizeChapter(srv.textFor(path)!, {
  basePath: path,
  strictXml: book.epubVersion === 2,
  urlFor: (p) => {
    const ext = p.split(".").pop()?.toLowerCase();
    return `http://127.0.0.1:8113/res/${p}`;
  },
  getText: (p) => srv.textFor(p),
  settings: DEFAULT_SETTINGS,
});
console.log("issues:", result.issues.length ? result.issues : "none");
writeFileSync(`${OUT}/ch.html`, result.html);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.goto("http://127.0.0.1:8113/ch.html");
await page.waitForTimeout(300);
const dbg = await page.evaluate(async () => {
  const r = await fetch("http://127.0.0.1:8113/res/OEBPS/Images/kugiri.webp").then((x) => ({ ok: x.ok, status: x.status, ct: x.headers.get("content-type"), len: (async () => (await x.blob()).size)() })).catch((e) => String(e));
  const im = document.querySelector("img") as HTMLImageElement;
  return { fetch: r, imgComplete: im?.complete, imgNatural: im ? `${im.naturalWidth}x${im.naturalHeight}` : "no-img", cspMeta: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") };
});
console.log("DBG:", JSON.stringify(dbg));
// 复刻 paginator 的分栏环境
await page.evaluate(() => {
  const v = document.getElementById("epub-viewer") as HTMLElement;
  v.style.width = "800px";
  v.style.columnWidth = "800px";
  v.style.columnGap = "40px";
  v.style.columnFill = "auto";
  v.style.height = "100%";
  v.style.paddingTop = "35px";
  v.style.paddingBottom = "26px";
  void v.scrollWidth;
});
await page.waitForTimeout(300);
const report = await page.evaluate(() => {
  const imgs = Array.from(document.querySelectorAll("#epub-viewer img"));
  return imgs.map((im) => {
    const r = im.getBoundingClientRect();
    const cs = getComputedStyle(im);
    return {
      alt: im.getAttribute("alt"),
      natural: `${(im as HTMLImageElement).naturalWidth}x${(im as HTMLImageElement).naturalHeight}`,
      rect: `${Math.round(r.width)}x${Math.round(r.height)} @ (${Math.round(r.left)},${Math.round(r.top)})`,
      maxW: cs.maxWidth,
      maxH: cs.maxHeight,
      w: cs.width,
      h: cs.height,
      parent: (im.parentElement?.tagName || "") + "." + (im.parentElement?.className || ""),
    };
  });
});
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: "/home/herenfor/test/epub-reader/.img-repro.png", fullPage: false });
await browser.close();
server.close();
