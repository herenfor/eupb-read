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
  const p = new ChapterPaginator(iframe, server, { ...DEFAULT_SETTINGS }, false, () => {});
  await p.load(path);
  await new Promise((r) => setTimeout(r, 2000));
  const doc = iframe.contentDocument!;
  const viewer = doc.getElementById("epub-viewer")!;
  const win = doc.defaultView!;
  const ps = Array.from(viewer.querySelectorAll("p, h3, h4, h5, div"));
  let visible = 0, hidden = 0;
  const hiddenSamples: string[] = [];
  for (const el of ps) {
    const cs = win.getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    const isHidden = cs.display === "none" || r.width === 0 || r.height === 0;
    if (isHidden) {
      hidden++;
      if (hiddenSamples.length < 5) {
        hiddenSamples.push(
          `<${el.tagName} class="${(el as HTMLElement).className}"> ${(el.textContent ?? "").trim().slice(0, 30)}`
        );
      }
    } else visible++;
  }
  out.push(`p-001: 元素=${ps.length} 可见=${visible} 隐藏=${hidden}`);
  out.push("隐藏样例:");
  out.push(...hiddenSamples);
  // 检查样式表中隐藏类的规则
  const sheets = Array.from(doc.styleSheets);
  for (const s of sheets) {
    try {
      const rules = Array.from(s.cssRules);
      out.push(`sheet(${s.href ? "link" : "inline"}): ${rules.length} 条规则`);
    } catch {
      out.push(`sheet: 无法读取规则`);
    }
  }
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
