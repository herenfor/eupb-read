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
  // 模拟真实浏览器：预缓存字体字节，每次 iframe 加载（含重载）同步注入，
  // 使 paginator 的 fonts.ready 等待字体就绪后才测量（无竞态）
  const ttfBuf = await fetch("dejavu.ttf").then((r) => r.arrayBuffer());
  const injectFont = (): void => {
    const doc = iframe.contentDocument;
    if (!doc) return;
    const ff = new FontFace("DejaVu Sans", ttfBuf);
    (doc as unknown as { fonts: FontFaceSet }).fonts.add(ff);
    void ff.load(); // fonts.ready 会等待它
    // 同步应用字体：避免在分页器测量后再换字体导致布局漂移
    const viewer = doc.getElementById("epub-viewer");
    if (viewer) viewer.style.fontFamily = '"DejaVu Sans", sans-serif';
  };
  iframe.addEventListener("load", injectFont);

  const p = new ChapterPaginator(iframe, server, { ...DEFAULT_SETTINGS }, false, () => {});
  await p.load(path);
  await new Promise((r) => setTimeout(r, 1200));

  // 页顶取样（验证锚点回退路径）；排除容器本身（其 textContent 是整章）
  const topText = (): string => {
    const doc = iframe.contentDocument!;
    const viewer = doc.getElementById("epub-viewer")!;
    const padTop = parseFloat(viewer.style.paddingTop || "0") || 0;
    const el = doc.elementFromPoint(viewer.clientWidth * 0.5, padTop + 4);
    if (!el || el === viewer || el === doc.body) return "";
    return (el.textContent ?? "").trim().slice(0, 24);
  };
  // 目标文本在可见页中的纵向位置比例（0=页顶 1=页底；找不到返回 -1）
  const targetVPos = (text: string): number => {
    const doc = iframe.contentDocument!;
    const viewer = doc.getElementById("epub-viewer")!;
    const els = Array.from(viewer.querySelectorAll("p, h3, h4, h5, div"))
      .filter((el) => (el.textContent ?? "").includes(text.slice(0, 12))) as HTMLElement[];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const vp = viewer.getBoundingClientRect();
      if (r.right > vp.left && r.left < vp.right && r.bottom > vp.top && r.top < vp.bottom) {
        return (r.top + r.height / 2 - vp.top) / vp.height;
      }
    }
    return -1;
  };
  // 当前可见页（列）内是否包含目标文本
  const visibleContains = (text: string): boolean => {
    const doc = iframe.contentDocument!;
    const viewer = doc.getElementById("epub-viewer")!;
    const padTop = parseFloat(viewer.style.paddingTop || "0") || 0;
    const xs = [viewer.clientWidth * 0.2, viewer.clientWidth * 0.5, viewer.clientWidth * 0.8];
    const ys = [padTop + 10, viewer.clientHeight / 2, viewer.clientHeight - 10];
    const els = xs.flatMap((x) => ys.map((y) => doc.elementFromPoint(x, y)));
    return els.some((el) => (el?.textContent ?? "").includes(text.slice(0, 12)));
  };

  p.setPage(2);
  await new Promise((r) => setTimeout(r, 200));
  console.log(
    `[dbg] after setPage: scrollLeft=${iframe.contentDocument!.getElementById("epub-viewer")!.scrollLeft} metrics=${JSON.stringify(p as never)}`
  );
  const before = topText();
  const TARGET = before.slice(0, 12);
  out.push(`定位页2: 页首内容="${before}"`);

  // 场景1：窗口拉伸
  iframe.style.width = "620px";
  await new Promise((r) => setTimeout(r, 100));
  p.reflow();
  await new Promise((r) => setTimeout(r, 800));
  const afterResize = topText();
  const vpos1 = targetVPos(TARGET);
  out.push(`缩放 900→620 后: 页中心一致=${afterResize === before} 目标段落纵向位置=${vpos1 === -1 ? "不可见" : vpos1.toFixed(2)}`);

  // 场景2：字号变化（整体重载）
  await p.reloadWithSettings({ ...DEFAULT_SETTINGS, fontSizePx: 20 });
  await new Promise((r) => setTimeout(r, 1500));
  const afterFont = topText();
  const vpos2 = targetVPos(TARGET);
  out.push(`字号 16→20 后: 页中心内容="${afterFont}" 目标段落纵向位置=${vpos2 === -1 ? "不可见" : vpos2.toFixed(2)}`);
  document.getElementById("out")!.textContent = out.join("\n") + "\nDONE";
}
void main();
