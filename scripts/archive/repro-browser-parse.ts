import { DOMParser as LinkedDOMParser, parseHTML } from "linkedom";
import { unzipSync, strFromU8 } from "fflate";
import { readFileSync } from "node:fs";

// 模拟浏览器环境
(globalThis as Record<string, unknown>).DOMParser = LinkedDOMParser;
(globalThis as Record<string, unknown>).XMLSerializer = class {
  serializeToString(d: unknown): string {
    return String((d as { toString(): string }).toString());
  }
};

const { sanitizeChapter } = await import("../src/render/sanitize");
const { DEFAULT_SETTINGS } = await import("../src/render/settings");

const book = unzipSync(new Uint8Array(readFileSync(
  "/home/herenfor/test/测试用epub/[简][鐵人じゅす].原本只是跟全校第一美少女商量彼此挚友的恋爱烦恼，不知不觉间她竟成为我最亲近的存在.01.epub"
)));

const urlFor = (p: string) => `blob:test/${p}`;
const getText = (p: string) => (book[p] ? strFromU8(book[p]) : undefined);
let seq = 0;
const makeUrl = (t: string, type: string) => `blob:css/${++seq}/${type}`;

for (const path of ["OEBPS/Text/p-cover.xhtml", "OEBPS/Text/p-001.xhtml", "OEBPS/Text/summary.xhtml"]) {
  const ch = strFromU8(book[path]);
  const res = await sanitizeChapter(ch, {
    basePath: path, strictXml: false, urlFor, getText, makeUrl,
    settings: DEFAULT_SETTINGS,
  });
  const { document: d2 } = parseHTML(res.html);
  const viewer = d2.getElementById("epub-viewer");
  const body = d2.getElementsByTagName("body")[0];
  console.log(`=== ${path}`);
  console.log(`  sanitize 输出含 viewer: ${res.html.includes('id="epub-viewer"')}`);
  console.log(`  重解析 viewer: ${viewer ? `存在 children=${viewer.children.length} text=${(viewer.textContent ?? "").trim().slice(0, 20)}` : "丢失"}`);
  console.log(`  重解析 body children: ${body?.children.length} | ${body?.toString().replace(/\s+/g, " ").slice(0, 130)}`);
}
