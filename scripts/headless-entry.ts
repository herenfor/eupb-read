/**
 * 无头浏览器诊断入口（esbuild 打包后在 Edge/Chromium headless 中运行）：
 * 对目标书逐章跑真实分页器，输出每章的分页诊断数据。
 */
import { loadBook, spineItemPath } from "../src/core/book";
import { ResourceServer } from "../src/render/resources";
import { ChapterPaginator, type ChapterState } from "../src/render/paginator";
import { DEFAULT_SETTINGS } from "../src/render/settings";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const out: string[] = [];
  const log = (s: string): void => {
    out.push(s);
  };
  try {
    const b64 = await fetch("book.b64").then((r) => r.text());
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const book = await loadBook(bytes);
    log(`book: EPUB${book.version} title=${book.metadata.title} spine=${book.spine.length}`);
    const server = new ResourceServer(book);

    const results: string[] = [];
    for (let i = 0; i < book.spine.length; i++) {
      const path = spineItemPath(book, i);
      if (!path) {
        results.push(`[${i}] NO-PATH`);
        continue;
      }
      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "width:900px;height:700px;border:1px solid #999;display:block;background:#fff;";
      document.body.appendChild(iframe);

      let last: ChapterState = { status: "loading" };
      const p = new ChapterPaginator(
        iframe,
        server,
        { ...DEFAULT_SETTINGS },
        book.version === 2,
        (s) => {
          last = s;
        }
      );
      await p.load(path);
      for (let k = 0; k < 150 && last.status !== "ready" && last.status !== "error"; k++) {
        await sleep(50);
      }
      // 等图片加载与重排稳定后再读最终状态
      await sleep(900);

      let diag = "";
      try {
        const doc = iframe.contentDocument;
        if (!doc) {
          diag = "NO-DOC";
        } else {
          const viewer = doc.getElementById("epub-viewer");
          if (!viewer) {
            diag = "NO-VIEWER";
          } else {
            const cs = doc.defaultView!.getComputedStyle(viewer);
            diag =
              `sw=${viewer.scrollWidth} cw=${viewer.clientWidth} ch=${viewer.clientHeight} ` +
              `colW=${cs.columnWidth} colCount=${cs.columnCount} children=${viewer.children.length} ` +
              `textLen=${(viewer.textContent ?? "").trim().length} sheets=${doc.styleSheets.length} fontsSize=${(doc as unknown as { fonts: FontFaceSet }).fonts.size}`;
          }
        }
      } catch (e) {
        diag = `DIAG-ERR ${(e as Error).message}`;
      }
      results.push(
        `[${i}] ${path.split("/").pop()} → ${JSON.stringify(last)} | ${diag} | iframe=${iframe.clientWidth}x${iframe.clientHeight}`
      );
      p.dispose();
      iframe.remove();
      await sleep(20);
    }
    log(results.join("\n"));
    log("DONE");
  } catch (e) {
    log("FATAL: " + (e as Error).message);
    log("DONE");
  }
  const pre = document.getElementById("out") as HTMLPreElement;
  pre.textContent = out.join("\n");
}

void main();
