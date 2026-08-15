/**
 * 把解包的 EPUB 源码树打包回合法 .epub（mimetype 第一个条目且不压缩）。
 * 用法：node scripts/pack-epub.mjs <源码目录> [输出.epub]
 * 说明：源码树结构 = mimetype + META-INF/ + 内容目录（如 OPS/ 或 EPUB/）。
 */
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { zipSync } from "fflate";

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === ".DS_Store" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).replace(/\\/g, "/"));
  }
  return out;
}

const dir = process.argv[2];
const outPath = process.argv[3] ?? `${dir.replace(/\/+$/, "")}.epub`;
if (!dir || !existsSync(join(dir, "mimetype"))) {
  console.error("用法: node scripts/pack-epub.mjs <源码目录（含 mimetype）> [输出.epub]");
  process.exit(1);
}

const entries = {};
const mimetype = new Uint8Array(readFileSync(join(dir, "mimetype")));
// 规范要求：mimetype 为第一个条目、不压缩（fflate 元组形式传按文件选项）
entries["mimetype"] = [mimetype, { level: 0 }];

for (const f of walk(dir).filter((f) => f !== "mimetype")) {
  entries[f] = new Uint8Array(readFileSync(join(dir, f)));
}

writeFileSync(outPath, zipSync(entries, { level: 6 }));
console.log(`已打包：${outPath}（${Object.keys(entries).length} 个条目）`);
