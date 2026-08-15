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

  for (const idx of [8, 9]) {
    const path = spineItemPath(book, idx)!;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "width:900px;height:700px;border:1px solid #999;display:block;background:#fff;";
    document.body.appendChild(iframe);
    const p = new ChapterPaginator(iframe, server, { ...DEFAULT_SETTINGS }, false, () => {});
    await p.load(path);
    await new Promise((r) => setTimeout(r, 2000));
    const doc = iframe.contentDocument!;
    const viewer = doc.getElementById("epub-viewer")!;
    const cs = doc.defaultView!.getComputedStyle(viewer);
    const bodyCs = doc.defaultView!.getComputedStyle(doc.body);
    const firstP = viewer.querySelector("p");
    const pCs = firstP ? doc.defaultView!.getComputedStyle(firstP) : null;
    const lastEl = viewer.querySelectorAll("*")[viewer.querySelectorAll("*").length - 1];
    const lr = lastEl ? lastEl.getBoundingClientRect() : null;
    out.push(`===== ${path}`);
    out.push(`sw=${viewer.scrollWidth} sh=${viewer.scrollHeight} clientH=${viewer.clientHeight}`);
    out.push(`colW=${cs.columnWidth} colFill=${cs.columnFill} height=${cs.height}`);
    out.push(`body font=${bodyCs.fontSize}/${bodyCs.fontFamily?.slice(0, 30)}`);
    out.push(`firstP font=${pCs?.fontSize} lineH=${pCs?.lineHeight}`);
    out.push(`lastEl=${lastEl?.tagName}.${lastEl?.className} rect bottom=${lr?.bottom.toFixed(0)} left=${lr?.left.toFixed(0)}`);
    out.push(`images=${viewer.querySelectorAll("img").length} loaded=${Array.from(viewer.querySelectorAll("img")).filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).length}`);
    p.dispose();
    iframe.remove();
  }
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
