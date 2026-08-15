import { loadBook, spineItemPath } from "../src/core/book";
import { ResourceServer } from "../src/render/resources";
import { ChapterPaginator } from "../src/render/paginator";
import { DEFAULT_SETTINGS } from "../src/render/settings";

async function main(): Promise<void> {
  const b64 = await fetch("book.b64").then((r) => r.text());
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const book = await loadBook(bytes);
  const server = new ResourceServer(book);
  const out: string[] = [];
  const path = spineItemPath(book, 0)!;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "width:900px;height:700px;display:block;background:#fff;";
  document.body.appendChild(iframe);
  const p = new ChapterPaginator(iframe, server, { ...DEFAULT_SETTINGS }, false, () => {});
  await p.load(path);
  await new Promise((r) => setTimeout(r, 1500));
  const doc = iframe.contentDocument!;
  const viewer = doc.getElementById("epub-viewer")!;
  out.push("viewer class:", viewer.getAttribute("class") ?? "(无)");
  const wrapper = viewer.firstElementChild as HTMLElement;
  const wcs = doc.defaultView!.getComputedStyle(wrapper);
  out.push(`wrapper: ${wrapper.tagName}.${wrapper.className} height=${wcs.height}`);
  out.push("--- 样式表与匹配 ---");
  for (const s of Array.from(doc.styleSheets)) {
    let rules = 0;
    try { rules = s.cssRules.length; } catch { rules = -1; }
    out.push(`sheet(${s.href ? "link" : "inline"}) rules=${rules}`);
  }
  // 找注入的 fullpage style
  const fpStyle = Array.from(doc.querySelectorAll("style[data-reader]"));
  out.push("reader styles:", fpStyle.map((el) => el.getAttribute("data-reader")).join(","));
  const fullpage = doc.querySelector("style[data-reader='fullpage-image']");
  out.push("fullpage css:", fullpage ? (fullpage.textContent ?? "").replace(/\s+/g, " ").slice(0, 200) : "MISSING");
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
