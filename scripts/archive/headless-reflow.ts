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
  const path = spineItemPath(book, 9)!; // p-001
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "width:900px;height:700px;display:block;background:#fff;";
  document.body.appendChild(iframe);
  let last: { pageCount: number; currentPage: number } = { pageCount: 0, currentPage: 0 };
  const p = new ChapterPaginator(
    iframe, server, { ...DEFAULT_SETTINGS }, false,
    (s) => { if (s.status === "ready") last = s; }
  );
  await p.load(path);
  await new Promise((r) => setTimeout(r, 1500));
  const doc = iframe.contentDocument!;
  const viewer = doc.getElementById("epub-viewer")!;
  const step1 = viewer.clientWidth + 24;
  const sl1 = viewer.scrollLeft;
  out.push(`初始: pageCount=${last.pageCount} current=${last.currentPage} scrollLeft=${sl1} 对齐=${sl1 % step1 === 0} 图块宽=${(viewer.querySelector(".illus") as HTMLElement).getBoundingClientRect().width.toFixed(0)}`);

  // 翻到第 2 页再模拟窗口缩放
  p.setPage(1);
  await new Promise((r) => setTimeout(r, 200));
  const sl2 = viewer.scrollLeft;
  out.push(`翻页后: scrollLeft=${sl2} 对齐=${sl2 % step1 === 0}`);

  // 模拟窗口拉伸：iframe 900→620，触发重排
  iframe.style.width = "620px";
  await new Promise((r) => setTimeout(r, 100));
  p.reflow();
  await new Promise((r) => setTimeout(r, 800));
  const step2 = viewer.clientWidth + 24;
  const sl3 = viewer.scrollLeft;
  out.push(`缩放后(620px): pageCount=${last.pageCount} current=${last.currentPage} scrollLeft=${sl3} step=${step2} 对齐=${sl3 % step2 === 0} 图块宽=${(viewer.querySelector(".illus") as HTMLElement).getBoundingClientRect().width.toFixed(0)}`);
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
