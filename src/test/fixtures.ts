/**
 * 测试用 EPUB 构造器：程序化生成合法（或故意损坏）的 EPUB 2 / EPUB 3。
 * 用 fflate 的 zipSync 组装，mimetype 置为第一个条目且不压缩（level 0）。
 */
import { zipSync, strToU8 } from "fflate";
import { obfuscateFont } from "../core/fonts";

export interface ChapterSpec {
  id: string;
  href: string;
  content: string;
  linear?: boolean;
}

export interface TocEntrySpec {
  label: string;
  href: string;
  children?: TocEntrySpec[];
}

export interface BuildOptions {
  version: 2 | 3;
  title?: string;
  identifier?: string;
  modified?: string;
  chapters: ChapterSpec[];
  /** 额外文本文件（如 CSS、图片占位） */
  extraTexts?: Array<{ path: string; text: string }>;
  /** 额外二进制文件 */
  extraFiles?: Array<{ path: string; data: Uint8Array }>;
  /** 内嵌字体（manifest 自动登记为 application/vnd.ms-opentype） */
  fonts?: Array<{ path: string; data: Uint8Array }>;
  /** 需要混淆的字体路径（自动生成 encryption.xml 并混淆） */
  obfuscateFonts?: string[];
  includeNcx?: boolean;
  includeNav?: boolean;
  /** 自定义目录（默认用章节列表生成） */
  toc?: TocEntrySpec[];
  fixedLayout?: boolean;
  viewport?: string;
  /** 使用 ADEPT 算法声明加密（模拟 DRM） */
  drm?: string[];
  /** 封面 meta（EPUB2 风格 name=cover） */
  coverMeta?: string;
}

export async function buildEpub(opts: BuildOptions): Promise<Uint8Array> {
  const version = opts.version;
  const identifier = opts.identifier ?? "urn:uuid:test-0000-0000-0000-000000000000";
  const title = opts.title ?? "测试书";
  const modified = opts.modified ?? "2024-01-01T00:00:00Z";

  const files: Record<string, Uint8Array> = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    ),
  };

  // 章节
  const items: string[] = [];
  const spine: string[] = [];
  const ncxPoints: string[] = [];
  let playOrder = 0;
  for (const ch of opts.chapters) {
    files[`OEBPS/${ch.href}`] = strToU8(ch.content);
    items.push(`<item id="${ch.id}" href="${ch.href}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${ch.id}"${ch.linear === false ? ' linear="no"' : ""}/>`);
    playOrder++;
    ncxPoints.push(`
      <navPoint id="np-${ch.id}" playOrder="${playOrder}">
        <navLabel><text>${ch.id}</text></navLabel>
        <content src="${ch.href}"/>
      </navPoint>`);
  }

  // 字体（混淆后再写入）
  for (const f of opts.fonts ?? []) {
    let data = f.data;
    if ((opts.obfuscateFonts ?? []).includes(f.path)) {
      data = await obfuscateFont(data, identifier);
    }
    files[`OEBPS/${f.path}`] = data;
    items.push(
      `<item id="font-${f.path}" href="${f.path}" media-type="application/vnd.ms-opentype"/>`
    );
  }

  // 额外文件（不登记 manifest，测试缺资源场景时用）
  for (const t of opts.extraTexts ?? []) {
    files[`OEBPS/${t.path}`] = strToU8(t.text);
  }
  for (const f of opts.extraFiles ?? []) {
    files[`OEBPS/${f.path}`] = f.data;
  }

  // NCX（EPUB 2）
  if (opts.includeNcx ?? version === 2) {
    const points = opts.toc ? tocNcx(opts.toc, playOrder) : ncxPoints.join("\n");
    files["OEBPS/toc.ncx"] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${identifier}"/>
  </head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>${points}</navMap>
</ncx>`
    );
    items.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);
  }

  // nav（EPUB 3）
  if (opts.includeNav ?? version === 3) {
    const toc: TocEntrySpec[] = opts.toc ?? opts.chapters.map((c) => ({ label: c.id, href: c.href }));
    files["OEBPS/nav.xhtml"] = strToU8(navHtml(title, toc));
    items.push(
      `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`
    );
  }

  // encryption.xml
  const encRefs: string[] = [];
  for (const fp of opts.obfuscateFonts ?? []) {
    encRefs.push(encryptedData(`OEBPS/${fp}`, "http://www.idpf.org/2008/embedding"));
  }
  for (const fp of opts.drm ?? []) {
    encRefs.push(
      encryptedData(`OEBPS/${fp}`, "urn:uuid:9c5c2df5-4d4d-4b3d-9c5c-2df54d4d4b3d")
    );
  }
  if (encRefs.length > 0) {
    files["META-INF/encryption.xml"] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  ${encRefs.join("\n  ")}
</encryption>`
    );
  }

  // OPF
  const metaLines: string[] = [
    `<dc:identifier id="uid">${identifier}</dc:identifier>`,
    `<dc:title>${title}</dc:title>`,
    `<dc:language>zh-CN</dc:language>`,
  ];
  if (version === 3) {
    metaLines.push(`<meta property="dcterms:modified">${modified}</meta>`);
  }
  if (opts.fixedLayout) {
    metaLines.push(`<meta property="rendition:layout">pre-paginated</meta>`);
    if (opts.viewport) {
      metaLines.push(`<meta property="rendition:viewport">${opts.viewport}</meta>`);
    }
  }
  if (opts.coverMeta) {
    metaLines.push(`<meta name="cover" content="${opts.coverMeta}"/>`);
  }

  files["OEBPS/content.opf"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${version === 2 ? "2.0" : "3.0"}" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${metaLines.join("\n    ")}
  </metadata>
  <manifest>
    ${items.join("\n    ")}
  </manifest>
  <spine${version === 2 ? ' toc="ncx"' : ""}>
    ${spine.join("\n    ")}
  </spine>
</package>`
  );

  // mimetype 必须第一个且不压缩
  return zipSync({ mimetype: files.mimetype, ...files }, { level: 6 });
}

function tocNcx(toc: TocEntrySpec[], startOrder: number): string {
  let order = startOrder;
  const walk = (entries: TocEntrySpec[]): string =>
    entries
      .map((e) => {
        order++;
        const kids = e.children?.length ? walk(e.children) : "";
        return `<navPoint id="np-${order}" playOrder="${order}">
          <navLabel><text>${e.label}</text></navLabel>
          <content src="${e.href}"/>
          ${kids}
        </navPoint>`;
      })
      .join("\n");
  return walk(toc);
}

function navHtml(title: string, toc: TocEntrySpec[]): string {
  const walk = (entries: TocEntrySpec[]): string =>
    `<ol>${entries
      .map(
        (e) =>
          `<li><a href="${e.href}">${e.label}</a>${
            e.children?.length ? walk(e.children) : ""
          }</li>`
      )
      .join("")}</ol>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>${title}</title></head>
  <body>
    <nav epub:type="toc">${walk(toc)}</nav>
  </body>
</html>`;
}

function encryptedData(uri: string, algorithm: string): string {
  return `<EncryptedData>
    <EncryptionMethod Algorithm="${algorithm}"/>
    <CipherData>
      <CipherReference URI="${uri}"/>
    </CipherData>
  </EncryptedData>`;
}
