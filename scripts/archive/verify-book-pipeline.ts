/**
 * 端到端管线验证（tsx 运行）：对真实书章节执行 sanitize 全流程，
 * 模拟浏览器的 blob URL（node 无 createObjectURL）。
 */
import { unzipSync, strFromU8 } from "fflate";
import { readFileSync } from "node:fs";
import { sanitizeChapter } from "../src/render/sanitize";
import { rewriteCssUrls } from "../src/render/cssRewrite";
import { DEFAULT_SETTINGS } from "../src/render/settings";
import type { Book } from "../src/core/types";
import { ResourceServer } from "../src/render/resources";
import { loadBook } from "../src/core/book";

const BOOK =
  "<PROJECT_ROOT>/测试用epub/[简][鐵人じゅす].原本只是跟全校第一美少女商量彼此挚友的恋爱烦恼，不知不觉间她竟成为我最亲近的存在.01.epub";

const bytes = new Uint8Array(readFileSync(BOOK));
const book: Book = await loadBook(bytes);
const server = new ResourceServer(book);
let urlSeq = 0;
const fakeMakeUrl = (text: string, type: string): string => {
  urlSeq++;
  return `blob:fake/${urlSeq}/${type}`;
};
const urlMap = new Map<string, string>(); // path -> fake url
const fakeUrlFor = (p: string): string | undefined => {
  const res = book.resources.get(p);
  if (!res) return undefined;
  if (!urlMap.has(p)) urlMap.set(p, `blob:fake-res/${urlMap.size}`);
  return urlMap.get(p)!;
};

const chapterPath = "OEBPS/Text/p-001.xhtml";
const chText = strFromU8(book.resources.get(chapterPath)!.data);

const res = await sanitizeChapter(chText, {
  basePath: chapterPath,
  strictXml: false,
  urlFor: fakeUrlFor,
  getText: (p) => server.textFor(p),
  makeUrl: fakeMakeUrl,
  settings: DEFAULT_SETTINGS,
});

const checks: Array<[string, boolean]> = [
  ["分页容器存在", res.html.includes('id="epub-viewer"')],
  ["正文保留", res.html.includes("自称平凡高中生的我")],
  ["脚本已移除", !res.html.includes("<script")],
  ["降级未发生", !res.downgraded],
];

// 检查样式表 link 指向改写后的 blob
const linkHref = /<link[^>]*href="([^"]+)"/.exec(res.html)?.[1] ?? "";
checks.push(["样式表已改写为 blob", linkHref.startsWith("blob:fake/")]);
checks.push(["sanitize 无 issue", res.issues.length === 0]);

// 直接验证书内 CSS 链的改写结果（等价于浏览器内联展开）
const stylesheet = server.textFor("OEBPS/Styles/stylesheet.css")!;
const rewrittenCss = rewriteCssUrls(stylesheet, "OEBPS/Styles/stylesheet.css", fakeUrlFor);
checks.push([
  "@import 链改写成功",
  rewrittenCss.includes('@import url("blob:fake-res/') &&
    rewrittenCss.includes("default.css") === false &&
    /@import url\("blob:fake-res\/[^"]+"\);/.test(rewrittenCss),
]);
const defaultCss = server.textFor("OEBPS/Styles/default.css")!;
const rewrittenDefault = rewriteCssUrls(defaultCss, "OEBPS/Styles/default.css", fakeUrlFor);
checks.push([
  "字体 @font-face url 指向 blob",
  /url\("blob:fake-res\/[^"]+"\)/.test(rewrittenDefault),
]);
checks.push([
  "必要 CSS 的 @font-face 数量 ≥ 13",
  (rewriteCssUrls(server.textFor("OEBPS/Styles/necessary.css")!, "OEBPS/Styles/necessary.css", fakeUrlFor).match(/@font-face/g) ?? []).length >= 13,
]);

let pass = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (ok) pass++;
}
console.log(`\n${pass}/${checks.length} 项通过`);
if (pass !== checks.length) process.exit(1);
