import { loadBook, spineItemPath } from "../src/core/book";
import { ResourceServer } from "../src/render/resources";
import { sanitizeChapter } from "../src/render/sanitize";
import { DEFAULT_SETTINGS } from "../src/render/settings";

async function main(): Promise<void> {
  const b64 = await fetch("book.b64").then((r) => r.text());
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const book = await loadBook(bytes);
  const server = new ResourceServer(book);
  const out: string[] = [];

  for (const path of ["OEBPS/Text/p-001.xhtml", "OEBPS/Text/title.xhtml"]) {
    const chText = server.textFor(path)!;
    const res = await sanitizeChapter(chText, {
      basePath: path,
      strictXml: false,
      urlFor: (p) => server.urlFor(p),
      getText: (p) => server.textFor(p),
      makeUrl: (t, m) => URL.createObjectURL(new Blob([t], { type: m })),
      settings: DEFAULT_SETTINGS,
    });
    out.push(`===== ${path} =====`);
    out.push(`issues: ${JSON.stringify(res.issues)}`);
    out.push(`downgraded: ${res.downgraded}`);
    // 提取 body 部分
    const bodyStart = res.html.indexOf("<body");
    const bodyEnd = res.html.indexOf("</body>");
    const bodyPart = bodyStart >= 0 ? res.html.slice(bodyStart, bodyEnd + 7) : "(无 body)";
    out.push(`body 长度: ${bodyPart.length}`);
    out.push(`body 前 900 字符:`);
    out.push(bodyPart.replace(/\s+/g, " ").slice(0, 900));
    out.push("");
  }
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
