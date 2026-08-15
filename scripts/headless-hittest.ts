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
  const path = spineItemPath(book, 9)!;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "width:900px;height:700px;display:block;background:#fff;";
  document.body.appendChild(iframe);
  const ttfBuf = await fetch("dejavu.ttf").then((r) => r.arrayBuffer());
  iframe.addEventListener("load", () => {
    const doc = iframe.contentDocument!;
    const ff = new FontFace("DejaVu Sans", ttfBuf);
    (doc as unknown as { fonts: FontFaceSet }).fonts.add(ff);
    void ff.load();
    doc.getElementById("epub-viewer")!.style.fontFamily = '"DejaVu Sans", sans-serif';
  });
  const p = new ChapterPaginator(iframe, server, { ...DEFAULT_SETTINGS }, false, () => {});
  await p.load(path);
  await new Promise((r) => setTimeout(r, 1500));
  const doc = iframe.contentDocument!;
  const viewer = doc.getElementById("epub-viewer")!;

  p.setPage(2);
  await new Promise((r) => setTimeout(r, 100));
  out.push(`scrollLeft=${viewer.scrollLeft} step=924`);
  for (const [x, y] of [[450, 350], [450, 50], [150, 350], [450, 690]] as const) {
    const el = doc.elementFromPoint(x, y);
    out.push(`point(${x},${y}) → ${el ? el.tagName + "." + (el as HTMLElement).className + " \"" + (el.textContent ?? "").trim().slice(0, 16) + "\"" : "NULL"}`);
  }
  // 可见列内有哪些元素
  const vis = Array.from(viewer.querySelectorAll("p, h4, h5")).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.right > 0 && r.left < 900 && r.bottom > 0 && r.top < 700;
  });
  out.push(`可见元素 ${vis.length} 个，前3个: ${vis.slice(0, 3).map((e) => (e.textContent ?? "").trim().slice(0, 12)).join(" | ")}`);
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
