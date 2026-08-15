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
  const paths = [spineItemPath(book, 9)!, spineItemPath(book, 0)!]; // p-001 文本章 + 封面图片页

  for (const path of paths) {
  for (const W of [900, 500]) {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = `width:${W}px;height:700px;display:block;background:#fff;`;
    document.body.appendChild(iframe);
    let last = { pageCount: 0 };
    const p = new ChapterPaginator(
      iframe, server, { ...DEFAULT_SETTINGS }, false,
      (s) => { if (s.status === "ready") last = s; }
    );
    await p.load(path);
    await new Promise((r) => setTimeout(r, 1500));
    const doc = iframe.contentDocument!;
    const viewer = doc.getElementById("epub-viewer")!;
    const rect = viewer.getBoundingClientRect();
    const cs = doc.defaultView!.getComputedStyle(viewer);
    const firstP = viewer.querySelector("p");
    const pr = firstP ? firstP.getBoundingClientRect() : null;
    const illus = viewer.querySelector(".illus, .kuchie, .cover");
    const ilr = illus ? illus.getBoundingClientRect() : null;
    const illImg = illus ? illus.querySelector("img") : null;
    const ii = illImg ? illImg.getBoundingClientRect() : null;
    out.push(
      `[${path.split("/").pop()}] iframe=${W}px → 容器=${viewer.clientWidth}px | 上留白=${cs.paddingTop} 下留白=${cs.paddingBottom} | 正文段=${pr ? `${pr.width.toFixed(0)}w@${pr.left.toFixed(0)}` : "无"} | 图块=${ilr ? `${ilr.width.toFixed(0)}x${ilr.height.toFixed(0)}` : "无"} 图块内图片=${ii ? `${ii.width.toFixed(0)}x${ii.height.toFixed(0)}` : "无"}`
    );
    p.dispose();
    iframe.remove();
  }
  }
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
