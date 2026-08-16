// 把测试书里自带的 EPUB 字体提取到项目字体目录，
// 供无头 Chromium 在 WSL 无系统字体环境下做文本测量/渲染回归。
// 用法: node scripts/setup-pw-fonts.mjs [输出目录]
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";

const rootDir = "/home/herenfor/test";
const bookDir = join(rootDir, "测试用epub");
const outDir = resolve(process.argv[2] ?? join(rootDir, ".pw-xdg", "fonts"));
mkdirSync(outDir, { recursive: true });

const epubs = readdirSync(bookDir).filter((f) => f.toLowerCase().endsWith(".epub"));
let count = 0;
for (const name of epubs) {
  const bytes = new Uint8Array(readFileSync(join(bookDir, name)));
  let files;
  try {
    files = unzipSync(bytes);
  } catch (e) {
    console.warn(`跳过无法解压: ${name} (${String(e)})`);
    continue;
  }
  for (const [path, data] of Object.entries(files)) {
    if (!/\.(?:ttf|otf)$/i.test(path)) continue;
    const outName = path.split("/").pop() ?? path;
    writeFileSync(join(outDir, outName), data);
    count++;
  }
}
console.log(`已提取 ${count} 个字体到 ${outDir}`);
console.log("运行时请设置:");
console.log(`  XDG_DATA_HOME=${join(bookDir, ".pw-xdg")}`);
