/**
 * 生成 Tauri 所需的应用图标（PNG 各尺寸 + Windows ICO）。
 * 纯 Node 实现：手写 PNG 编码（zlib deflate + CRC32），ICO 内嵌 PNG（Vista+ 支持）。
 * 用法：node scripts/gen-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

// ---- CRC32 ----
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 每行前加 filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 图标绘制：蓝底圆角 + 白色书本 ----
function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}
function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function drawIcon(size) {
  const bg = hex("#2b5b9e");
  const bgDark = hex("#1d4070");
  const white = hex("#f5f7fa");
  const line = hex("#9db4d6");
  const px = new Uint8Array(size * size * 4);
  const s = size;
  const r = s * 0.18; // 圆角半径
  const inBook = (x, y) => {
    const bx0 = s * 0.2, bx1 = s * 0.8, by0 = s * 0.22, by1 = s * 0.78;
    return x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
  };
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      // 圆角矩形背景
      let c = bg;
      const cx = Math.min(Math.max(x, r), s - r);
      const cy = Math.min(Math.max(y, r), s - r);
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) {
        px[i + 3] = 0; // 圆角外透明
        continue;
      }
      // 顶部高光
      if (y < s * 0.12) c = mix(bg, white, 0.25);
      else if (y > s * 0.82) c = mix(bg, bgDark, 0.5);
      // 书本
      if (inBook(x, y)) {
        c = white;
        // 书脊
        if (Math.abs(x - s * 0.44) < s * 0.015) c = mix(white, line, 0.8);
        // 文字行
        const lineYs = [0.34, 0.46, 0.58, 0.70];
        for (const ly of lineYs) {
          if (Math.abs(y - s * ly) < Math.max(1.2, s * 0.02)) {
            c = mix(white, line, 0.75);
            break;
          }
        }
      }
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
  }
  return px;
}

function encodeIco(pngs) {
  // ICONDIR
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)]);
}

const sizes = [32, 128, 256];
const pngs = sizes.map((size) => ({ size, png: encodePng(size, drawIcon(size)) }));
const bySize = Object.fromEntries(pngs.map((p) => [p.size, p.png]));

writeFileSync(join(outDir, "32x32.png"), bySize[32]);
writeFileSync(join(outDir, "128x128.png"), bySize[128]);
writeFileSync(join(outDir, "128x128@2x.png"), bySize[256]);
writeFileSync(join(outDir, "icon.ico"), encodeIco(pngs));
console.log("icons written to", outDir);
