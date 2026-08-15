import type { Book } from "../core/types";

/**
 * 把书内资源映射为 blob URL（同源，iframe 内可自由引用字体/图片/CSS）。
 * 带缓存；书关闭时统一 revoke。
 */
export class ResourceServer {
  private urls = new Map<string, string>();

  constructor(private book: Book) {}

  /** 返回内部路径对应的 blob URL；资源缺失返回 undefined。 */
  urlFor(path: string): string | undefined {
    const cached = this.urls.get(path);
    if (cached) return cached;
    const res = this.book.resources.get(path);
    if (!res) return undefined;
    const url = URL.createObjectURL(
      new Blob([res.data as BlobPart], { type: res.mediaType || "application/octet-stream" })
    );
    this.urls.set(path, url);
    return url;
  }

  /** 读取资源文本（按 UTF-8；带 BOM 时尊重 BOM 编码）。 */
  textFor(path: string): string | undefined {
    const res = this.book.resources.get(path);
    if (!res) return undefined;
    return decodeBytes(res.data);
  }

  revokeAll(): void {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
  }
}

export function decodeBytes(data: Uint8Array): string {
  // UTF-16 BOM 检测（老书偶见）
  if (data.length >= 2) {
    if (data[0] === 0xff && data[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(data.slice(2));
    }
    if (data[0] === 0xfe && data[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(data.slice(2));
    }
  }
  return new TextDecoder("utf-8").decode(data);
}
