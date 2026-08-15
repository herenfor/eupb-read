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
  const path = spineItemPath(book, 8)!; // p-toc-001（书内目录页，含链接）
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "width:900px;height:700px;display:block;background:#fff;";
  document.body.appendChild(iframe);

  const navigations: string[] = [];
  let lastState = "loading";
  const p = new ChapterPaginator(
    iframe, server, { ...DEFAULT_SETTINGS }, false,
    (s) => { lastState = s.status; },
    undefined, false,
    (href) => navigations.push(href)
  );
  await p.load(path);
  await new Promise((r) => setTimeout(r, 1200));
  const doc = iframe.contentDocument!;
  const viewer = doc.getElementById("epub-viewer");
  out.push(`加载后: state=${lastState} viewer存在=${!!viewer} 链接数=${doc.querySelectorAll("a").length}`);

  // 模拟点击第一个章节链接
  const link = doc.querySelector("a[href*='p-001']") as HTMLElement;
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 300));

  const doc2 = iframe.contentDocument!;
  const viewer2 = doc2.getElementById("epub-viewer");
  out.push(`点击后: 导航回调=${JSON.stringify(navigations)}`);
  out.push(`点击后: iframe 内容仍在=${!!viewer2 && viewer2.children.length > 0} 链接仍在=${doc2.querySelectorAll("a").length > 0}`);
  out.push(`src 未变=${iframe.src === (iframe as HTMLIFrameElement & { dataset: { orig?: string } }).dataset.orig}`);
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
