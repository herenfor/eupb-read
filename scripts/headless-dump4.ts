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
  await new Promise((r) => setTimeout(r, 2000));
  const doc = iframe.contentDocument!;
  const viewer = doc.getElementById("epub-viewer")!;
  const win = doc.defaultView!;
  const ps = Array.from(viewer.querySelectorAll("p"));
  const hidden = ps.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width === 0 || r.height === 0;
  }) as HTMLElement | undefined;
  if (hidden) {
    const cs = win.getComputedStyle(hidden);
    out.push(`标签: <${hidden.tagName} class="${hidden.className}">`);
    out.push(`display=${cs.display} fontSize=${cs.fontSize} lineHeight=${cs.lineHeight} height=${cs.height} width=${cs.width}`);
    out.push(`fontFamily=${cs.fontFamily.slice(0, 60)}`);
    out.push(`position=${cs.position} float=${cs.float}`);
    out.push(`visibility=${cs.visibility} opacity=${cs.opacity} color=${cs.color}`);
    out.push(`innerHTML=${hidden.innerHTML.slice(0, 80)}`);
    out.push(`getClientRects=${hidden.getClientRects().length}`);
    // 检查规则来源：哪条规则给了它 font-size/display
    out.push("--- 匹配规则 ---");
    for (const s of Array.from(doc.styleSheets)) {
      try {
        for (const r of Array.from(s.cssRules)) {
          const rt = r as CSSStyleRule;
          if (rt.selectorText && hidden.matches(rt.selectorText)) {
            out.push(`  [${rt.selectorText}] ${rt.style.cssText.slice(0, 100)}`);
          }
        }
      } catch { /* 忽略 */ }
    }
  }
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
