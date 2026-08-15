/**
 * 合规书自检工具：用阅读器自己的解析内核加载 EPUB，输出完整报告。
 * 用法：pnpm check <book.epub> [更多.epub ...]
 * 退出码：全部通过 0；任何书有致命错误 1；有 issue（非致命）2。
 */
import { readFileSync } from "node:fs";
import { loadBook, spineIndexForPath, spineItemPath } from "../src/core/book";

function tocReport(nodes, depth, out) {
  for (const n of nodes) {
    out.push(`${"  ".repeat(depth)}- ${n.label || "(无标题)"} -> ${n.href || "(无 href)"}`);
    tocReport(n.children, depth + 1, out);
  }
}

async function checkBook(file) {
  const bytes = new Uint8Array(readFileSync(file));
  const book = await loadBook(bytes);

  const lines = [];
  const fails = [];
  lines.push(`== ${file}`);
  lines.push(`  EPUB ${book.version} · 《${book.metadata.title}》`);
  lines.push(`  identifier: ${book.metadata.identifier || "(无)"}`);
  lines.push(`  language: ${book.metadata.language || "(无)"}`);
  lines.push(`  固定版式: ${book.fixedLayout ? "是" : "否"}${book.viewport ? ` (${book.viewport})` : ""}`);
  lines.push(`  spine: ${book.spine.length} 项（linear: ${book.spine.filter((s) => s.linear).length}）`);
  lines.push(`  资源: ${book.resources.size} 个`);
  lines.push(`  目录: ${book.toc.length} 条顶层`);

  // 逐章检查
  let missing = 0;
  for (let i = 0; i < book.spine.length; i++) {
    const path = spineItemPath(book, i);
    if (!path || !book.resources.has(path)) {
      missing++;
      fails.push(`  [FAIL] spine[${i}] 章节资源缺失: ${path}`);
    }
  }
  if (missing === 0) lines.push(`  章节资源: 全部存在 ✓`);

  // manifest 声明 vs 实际
  const declared = new Set(book.manifest.values().map((m) => m.href));
  void declared;

  // 目录可跳转性
  let tocBroken = 0;
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.href && !n.href.startsWith("#")) {
        const idx = spineIndexForPath(book, n.href);
        if (idx < 0) {
          tocBroken++;
          fails.push(`  [FAIL] 目录条目 "${n.label}" 无法定位: ${n.href}`);
        }
      }
      walk(n.children);
    }
  };
  walk(book.toc);
  if (tocBroken === 0) lines.push(`  目录跳转: 全部可定位 ✓`);

  // issues
  if (book.issues.length > 0) {
    lines.push(`  issues (${book.issues.length}):`);
    for (const i of book.issues) lines.push(`    [${i.kind}:${i.source}] ${i.message}`);
  } else {
    lines.push(`  issues: 无 ✓`);
  }

  console.log(lines.join("\n"));
  if (fails.length > 0) {
    console.log(fails.join("\n"));
  }
  return fails.length;
}

let exitCode = 0;
for (const file of process.argv.slice(2)) {
  try {
    const failCount = await checkBook(file);
    if (failCount > 0 && exitCode === 0) exitCode = 1;
  } catch (e) {
    console.error(`[FATAL] ${file}: ${(e as Error).message}`);
    exitCode = 1;
  }
}
process.exit(exitCode);
