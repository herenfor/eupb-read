// 合成复现：测量各种 width:% 盒子在 #epub-viewer 分栏环境里的实际渲染宽度
import { chromium } from "playwright";
import { sanitizeChapter } from "../src/render/sanitize";
import { DEFAULT_SETTINGS } from "../src/render/settings";

const chapter = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>w90</title>
<style>
.paper{width:90%;margin:1em auto;padding:0.5em 1em;background:#eee;border:1px solid #000;}
.w100{width:100%;background:#fcc;}
.w50{width:50%;background:#cfc;}
</style></head><body>
<p>上面的文字行……测量用。</p>
<div class="paper" id="box90">width:90% 盒子</div>
<p>中间文字。</p>
<div class="w100" id="box100">width:100% 盒子</div>
<div class="w50" id="box50">width:50% 盒子</div>
<p>结尾文字。</p>
</body></html>`;

const result = await sanitizeChapter(chapter, {
  basePath: "OEBPS/Text/ch.xhtml",
  strictXml: true,
  urlFor: () => undefined,
  settings: DEFAULT_SETTINGS,
});

const browser = await chromium.launch({ headless: true });
for (const vw of [1100, 800, 650]) {
  const page = await browser.newPage({ viewport: { width: vw, height: 700 } });
  await page.setContent(result.html);
  await page.evaluate(() => {
    const v = document.getElementById("epub-viewer") as HTMLElement;
    v.style.width = `${document.documentElement.clientWidth}px`;
    v.style.columnWidth = `${document.documentElement.clientWidth}px`;
    v.style.columnGap = "40px";
    v.style.columnFill = "auto";
    v.style.height = "100%";
    v.style.paddingTop = "35px";
    v.style.paddingBottom = "26px";
    void v.scrollWidth;
  });
  const m = await page.evaluate(() => {
    const pageW = document.documentElement.clientWidth;
    const out: Record<string, string> = {};
    for (const id of ["box90", "box100", "box50"]) {
      const el = document.getElementById(id)!;
      const r = el.getBoundingClientRect();
      out[id] = `${Math.round(r.width)}px (占页面 ${Math.round((r.width / pageW) * 100)}%)`;
    }
    const p = document.querySelector("p")!.getBoundingClientRect();
    out["文字列"] = `${Math.round(p.width)}px`;
    return out;
  });
  console.log(`viewport=${vw}`, JSON.stringify(m));
  await page.close();
}
await browser.close();
