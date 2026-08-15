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
  const p = new ChapterPaginator(iframe, server, { ...DEFAULT_SETTINGS }, false, () => {});
  await p.load(path);
  await new Promise((r) => setTimeout(r, 1000));
  p.setPage(2);
  await new Promise((r) => setTimeout(r, 200));
  const a0 = p.getReadingAnchor();
  out.push(`初始锚点: ${JSON.stringify(a0)}`);

  const widths = [700, 560, 800, 640, 900];
  for (const w of widths) {
    iframe.style.width = `${w}px`;
    await new Promise((r) => setTimeout(r, 80));
    p.reflow();
    await new Promise((r) => setTimeout(r, 400));
    const a = p.getReadingAnchor();
    out.push(
      `宽度 ${w}px → 锚点 idx=${a?.index} ratio=${a?.ratio?.toFixed(3)} 粘性=${a?.index === a0?.index}`
    );
  }
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
