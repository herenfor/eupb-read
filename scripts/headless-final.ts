import { loadBook, spineItemPath } from "../src/core/book";
import { ResourceServer } from "../src/render/resources";
import { ChapterPaginator, type ChapterState } from "../src/render/paginator";
import { DEFAULT_SETTINGS } from "../src/render/settings";

async function main(): Promise<void> {
  const b64 = await fetch("book.b64").then((r) => r.text());
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const book = await loadBook(bytes);
  const server = new ResourceServer(book);
  const out: string[] = [];

  for (const idx of [0, 8, 9, 10, 19]) {
    const path = spineItemPath(book, idx)!;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "width:900px;height:700px;display:block;background:#fff;";
    document.body.appendChild(iframe);
    let last: ChapterState = { status: "loading" };
    const p = new ChapterPaginator(iframe, server, { ...DEFAULT_SETTINGS }, false, (s) => { last = s; });
    await p.load(path);
    for (let k = 0; k < 150 && last.status !== "ready"; k++) await new Promise((r) => setTimeout(r, 50));
    // 注入真实字体（无头环境无系统字体），重排
    const doc = iframe.contentDocument!;
    const ttf = await fetch("dejavu.ttf").then((r) => r.arrayBuffer());
    const ff = new FontFace("DejaVu Sans", await ttf);
    (doc as unknown as { fonts: FontFaceSet }).fonts.add(ff);
    await ff.load();
    doc.getElementById("epub-viewer")!.style.fontFamily = '"DejaVu Sans", sans-serif';
    await new Promise((r) => setTimeout(r, 800));
    p.reflow();
    await new Promise((r) => setTimeout(r, 800));
    const viewer = doc.getElementById("epub-viewer")!;
    const vis = Array.from(viewer.querySelectorAll("p, h3, h4, h5")).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).length;
    out.push(
      `${path.split("/").pop()} → ${JSON.stringify(last)} | sw=${viewer.scrollWidth} sh=${viewer.scrollHeight} | 可见文本块=${vis}`
    );
    p.dispose();
    iframe.remove();
  }
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
