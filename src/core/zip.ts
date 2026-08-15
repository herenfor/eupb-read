import { unzipSync, strFromU8 } from "fflate";

export interface ZipFile {
  /** 包内原始路径（未解码）。 */
  name: string;
  data: Uint8Array;
}

/**
 * 解压 EPUB（ZIP）并返回文件列表。
 * 校验 mimetype 是否为第一个条目且内容为 application/epub+zip。
 * 规范要求 mimetype 不压缩、位于第一位；fflate 解压不关心顺序，
 * 但我们仍校验其内容，并检查 META-INF/container.xml 是否存在。
 */
export function unzipEpub(bytes: Uint8Array): Map<string, ZipFile> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => !f.name.endsWith("/") });
  } catch (e) {
    throw new Error(`无法解压 ZIP：${(e as Error).message}`);
  }

  const map = new Map<string, ZipFile>();
  for (const [name, data] of Object.entries(files)) {
    map.set(name, { name, data });
  }

  const mime = map.get("mimetype");
  if (!mime) {
    throw new Error("不是有效的 EPUB：缺少 mimetype 文件");
  }
  const mimeText = strFromU8(mime.data).trim();
  if (mimeText !== "application/epub+zip") {
    throw new Error(`不是有效的 EPUB：mimetype 内容为 "${mimeText}"`);
  }
  if (!map.has("META-INF/container.xml")) {
    throw new Error("不是有效的 EPUB：缺少 META-INF/container.xml");
  }
  return map;
}

export function bytesToText(data: Uint8Array): string {
  return strFromU8(data);
}
