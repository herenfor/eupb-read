/**
 * 怪书测试库：真实世界里的"不合规但必须能读"的场景回归。
 * 每类问题（空章节、损坏声明、奇葩编码、危险内容、大小写等）
 * 对应一个用例，防止回归。
 */
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { buildEpub } from "./fixtures";
import { loadBook, nextLinearIndex } from "../core/book";
import { decodeBytes } from "../render/resources";
import { sanitizeChapter } from "../render/sanitize";
import { DEFAULT_SETTINGS } from "../render/settings";

const CH = `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>正文</p></body></html>`;

/** 手工拼一个最小 EPUB（用于破坏性测试）。 */
function rawEpub(opts: {
  opf: string;
  extra?: Record<string, Uint8Array>;
  mimetype?: string;
}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8(opts.mimetype ?? "application/epub+zip"),
    "META-INF/container.xml": strToU8(
      `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
      </container>`
    ),
    "OEBPS/content.opf": strToU8(opts.opf),
    ...(opts.extra ?? {}),
  };
  return zipSync({ mimetype: files.mimetype, ...files }, { level: 6 });
}

describe("怪书：空章节", () => {
  it("只有注释/空白的章节可加载，不崩溃", async () => {
    const bytes = await buildEpub({
      version: 3,
      chapters: [{ id: "c1", href: "ch1.xhtml", content: `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>空</title></head><body>
<!-- 只有注释 -->
</body></html>` }],
    });
    const book = await loadBook(bytes);
    expect(book.spine.length).toBe(1);
    expect(book.resources.has("OEBPS/ch1.xhtml")).toBe(true);
  });
});

describe("怪书：mimetype", () => {
  it("mimetype 内容错误 → 报错", async () => {
    const bytes = rawEpub({
      mimetype: "application/zip",
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="2.0"/>`,
    });
    await expect(loadBook(bytes)).rejects.toThrow(/mimetype/);
  });
});

describe("怪书：加密声明", () => {
  it("未知加密算法 → 记录 issue 且书仍可读", async () => {
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>zh</dc:language>
        </metadata>
        <manifest>
          <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine toc="ncx"><itemref idref="c1"/></spine>
      </package>`,
      extra: {
        "OEBPS/ch1.xhtml": strToU8(CH),
        "META-INF/encryption.xml": strToU8(
          `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData>
    <EncryptionMethod Algorithm="http://example.com/weird-algo"/>
    <CipherData><CipherReference URI="OEBPS/ch1.xhtml"/></CipherData>
  </EncryptedData>
</encryption>`
        ),
      },
    });
    const book = await loadBook(bytes);
    expect(book.issues.some((i) => i.message.includes("未知加密算法"))).toBe(true);
  });

  it("混淆声明指向非字体资源 → 记录 issue", async () => {
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>zh</dc:language>
        </metadata>
        <manifest>
          <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine toc="ncx"><itemref idref="c1"/></spine>
      </package>`,
      extra: {
        "OEBPS/ch1.xhtml": strToU8(CH),
        "META-INF/encryption.xml": strToU8(
          `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData>
    <EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <CipherData><CipherReference URI="OEBPS/ch1.xhtml"/></CipherData>
  </EncryptedData>
</encryption>`
        ),
      },
    });
    const book = await loadBook(bytes);
    expect(book.issues.some((i) => i.message.includes("不是字体"))).toBe(true);
    // 正文资源未被破坏
    expect(decodeBytes(book.resources.get("OEBPS/ch1.xhtml")!.data)).toContain("正文");
  });
});

describe("怪书：远程资源与旧版字体类型（官方测试套件暴露）", () => {
  it("remote-resources 不要求容器内有文件，也不报缺失", async () => {
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>en</dc:language>
          <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
        </metadata>
        <manifest>
          <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
          <item id="mp3" href="http://epubtest.org/media/remote/a.mp3" media-type="audio/mpeg" properties="remote-resources"/>
          <item id="mp4" href="http://epubtest.org/media/remote/b.mp4" media-type="audio/mp4"/>
          <item id="odd" href="ch2.xhtml" media-type="application/xhtml+xml" properties="remote-resources"/>
        </manifest>
        <spine><itemref idref="c1"/><itemref idref="odd"/></spine>
      </package>`,
      extra: { "OEBPS/ch1.xhtml": strToU8(CH), "OEBPS/ch2.xhtml": strToU8(CH) },
    });
    const book = await loadBook(bytes);
    expect(book.issues.some((i) => i.message.includes("资源缺失"))).toBe(false);
    // 声明 remote 但有本地副本的章节仍可读（测试套件 0100 的实际形态）
    expect(book.resources.has("OEBPS/ch2.xhtml")).toBe(true);
  });

  it("旧版 IDPF 字体类型（application/font-woff）的混淆字体正确还原", async () => {
    const FONT = new Uint8Array(1200).map((_, i) => (i * 7 + 3) % 256);
    const { obfuscateFont } = await import("../core/fonts");
    const obf = await obfuscateFont(FONT, "urn:uuid:x");
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>en</dc:language>
          <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
        </metadata>
        <manifest>
          <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
          <item id="fw" href="fonts/body.obf.woff" media-type="application/font-woff"/>
        </manifest>
        <spine><itemref idref="c1"/></spine>
      </package>`,
      extra: {
        "OEBPS/ch1.xhtml": strToU8(CH),
        "OEBPS/fonts/body.obf.woff": obf,
        "META-INF/encryption.xml": strToU8(
          `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData>
    <EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <CipherData><CipherReference URI="OEBPS/fonts/body.obf.woff"/></CipherData>
  </EncryptedData>
</encryption>`
        ),
      },
    });
    const book = await loadBook(bytes);
    const res = book.resources.get("OEBPS/fonts/body.obf.woff");
    expect(res).toBeDefined();
    expect(Array.from(res!.data)).toEqual(Array.from(FONT));
  });
});

describe("怪书：目录条目禁用标记（前端式目录适配）", () => {
  it("无法使用的条目被标记 disabled，正常条目不受影响", async () => {
    const navHtml = `<?xml version="1.0"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
<nav epub:type="toc">
  <ol>
    <li><a href="ch1.xhtml">正常章节</a></li>
    <li><a href="ghost.xhtml">不在spine</a></li>
    <li><a href="javascript:void(0)">JS跳转</a></li>
    <li><a href="https://example.com">外链</a></li>
  </ol>
</nav>
</body></html>`;
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>zh</dc:language>
          <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
        </metadata>
        <manifest>
          <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
          <item id="ghost" href="ghost.xhtml" media-type="application/xhtml+xml"/>
          <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        </manifest>
        <spine><itemref idref="c1"/></spine>
      </package>`,
      extra: {
        "OEBPS/ch1.xhtml": strToU8(CH),
        "OEBPS/ghost.xhtml": strToU8(CH),
        "OEBPS/nav.xhtml": strToU8(navHtml),
      },
    });
    const book = await loadBook(bytes);
    expect(book.toc.map((t) => t.label)).toEqual(["正常章节", "不在spine", "JS跳转", "外链"]);
    expect(book.toc[0].disabled).toBeUndefined();
    expect(book.toc[1].disabled).toBe(true);
    expect(book.toc[2].disabled).toBe(true);
    expect(book.toc[3].disabled).toBe(true);
  });

  it("前端式 div 目录（relative 包 absolute）整书解析", async () => {
    const navHtml = `<?xml version="1.0"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
<nav epub:type="toc">
  <div style="position:relative">
    <div style="position:absolute"><a href="ch1.xhtml">第一章</a></div>
    <div style="position:absolute"><a href="ch2.xhtml">第二章</a></div>
  </div>
</nav>
</body></html>`;
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>zh</dc:language>
          <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
        </metadata>
        <manifest>
          <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
          <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
          <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        </manifest>
        <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
      </package>`,
      extra: {
        "OEBPS/ch1.xhtml": strToU8(CH),
        "OEBPS/ch2.xhtml": strToU8(CH),
        "OEBPS/nav.xhtml": strToU8(navHtml),
      },
    });
    const book = await loadBook(bytes);
    expect(book.toc.map((t) => t.label)).toEqual(["第一章", "第二章"]);
    expect(book.toc.every((t) => t.disabled !== true)).toBe(true);
    expect(book.toc[0].href).toBe("OEBPS/ch1.xhtml");
  });
});

describe("怪书：spine / manifest 损坏", () => {
  it("spine 为空 → 不崩溃，目录为空并记录 issue", async () => {
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>zh</dc:language>
        </metadata>
        <manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
        <spine></spine>
      </package>`,
      extra: { "OEBPS/ch1.xhtml": strToU8(CH) },
    });
    const book = await loadBook(bytes);
    expect(book.spine.length).toBe(0);
    expect(book.issues.some((i) => i.message.includes("spine 也为空"))).toBe(true);
  });

  it("spine 引用不存在的 item → 跳过并记录 issue", async () => {
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>zh</dc:language>
        </metadata>
        <manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
        <spine toc="ncx"><itemref idref="ghost"/><itemref idref="c1"/></spine>
      </package>`,
      extra: { "OEBPS/ch1.xhtml": strToU8(CH) },
    });
    const book = await loadBook(bytes);
    expect(book.spine.map((s) => s.idref)).toEqual(["c1"]);
    expect(book.issues.some((i) => i.message.includes("ghost"))).toBe(true);
  });

  it("manifest item 缺 id → 跳过并记录 issue", async () => {
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>zh</dc:language>
        </metadata>
        <manifest>
          <item href="ch1.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine></spine>
      </package>`,
      extra: { "OEBPS/ch1.xhtml": strToU8(CH) },
    });
    const book = await loadBook(bytes);
    expect(book.manifest.size).toBe(0);
    expect(book.issues.some((i) => i.message.includes("缺少 id"))).toBe(true);
  });
});

describe("怪书：路径与大小写", () => {
  it("资源路径大小写敏感（按规范）", async () => {
    const bytes = await buildEpub({
      version: 3,
      chapters: [{ id: "c1", href: "Text/ch1.xhtml", content: CH }],
      extraTexts: [{ path: "styles/a.css", text: "x{}" }],
    });
    const book = await loadBook(bytes);
    // manifest 引用 Text/ch1.xhtml 与文件一致 ✓；styles/a.css 不在 manifest
    expect(book.resources.has("OEBPS/Text/ch1.xhtml")).toBe(true);
    expect(book.resources.has("OEBPS/text/ch1.xhtml")).toBe(false);
  });

  it("百分号编码路径可解析", async () => {
    const { zipSync, strToU8: u8 } = await import("fflate");
    const files = {
      mimetype: u8("application/epub+zip"),
      "META-INF/container.xml": u8(
        `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
        </container>`
      ),
      "OEBPS/content.opf": u8(
        `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:identifier id="uid">u</dc:identifier><dc:title>t</dc:title><dc:language>zh</dc:language>
            <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
          </metadata>
          <manifest><item id="c1" href="my%20book/ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
          <spine><itemref idref="c1"/></spine>
        </package>`
      ),
      "OEBPS/my book/ch1.xhtml": u8(CH),
    };
    const book = await loadBook(zipSync(files, { level: 6 }));
    expect(book.resources.has("OEBPS/my book/ch1.xhtml")).toBe(true);
  });
});

describe("怪书：阅读流", () => {
  it("nextLinearIndex 跳过 linear=no 的旁置章节", async () => {
    const bytes = await buildEpub({
      version: 2,
      chapters: [
        { id: "c1", href: "ch1.xhtml", content: CH },
        { id: "fn", href: "fn.xhtml", content: CH, linear: false },
        { id: "c2", href: "ch2.xhtml", content: CH },
      ],
    });
    const book = await loadBook(bytes);
    expect(nextLinearIndex(book, 0, 1)).toBe(2); // 跳过脚注章
    expect(nextLinearIndex(book, 2, 1)).toBe(-1); // 已到末尾
    expect(nextLinearIndex(book, 2, -1)).toBe(0); // 向前跳过脚注
  });
});

describe("怪书：封面与 guide", () => {
  it("EPUB2 meta cover 解析封面", async () => {
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>zh</dc:language>
          <meta name="cover" content="cov"/>
        </metadata>
        <manifest>
          <item id="cov" href="cover.jpg" media-type="image/jpeg"/>
          <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine toc="ncx"><itemref idref="c1"/></spine>
        <guide><reference type="cover" title="封面" href="cover.jpg"/></guide>
      </package>`,
      extra: {
        "OEBPS/cover.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        "OEBPS/ch1.xhtml": strToU8(CH),
      },
    });
    const book = await loadBook(bytes);
    expect(book.coverHref).toBe("OEBPS/cover.jpg");
    expect(book.guide.length).toBe(1);
    expect(book.guide[0].type).toBe("cover");
  });

  it("无效的标准封面声明会继续回退到 URL 编码的 cover.webp", async () => {
    const bytes = rawEpub({
      opf: `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="uid">urn:uuid:x</dc:identifier>
          <dc:title>t</dc:title><dc:language>zh</dc:language>
        </metadata>
        <manifest>
          <item id="missing-cover" href="missing.jpg" media-type="image/jpeg" properties="cover-image"/>
          <item id="image001" href="Images/Cover%2EWEBP?cache=1#preview" media-type="text/plain"/>
          <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine><itemref idref="c1"/></spine>
      </package>`,
      extra: {
        "OEBPS/Images/Cover.WEBP": new Uint8Array([0x52, 0x49, 0x46, 0x46]),
        "OEBPS/ch1.xhtml": strToU8(CH),
      },
    });
    const book = await loadBook(bytes);
    expect(book.coverHref).toBe("OEBPS/Images/Cover.WEBP");
  });
});

describe("怪书：危险内容消毒", () => {
  const san = (html: string) =>
    sanitizeChapter(html, {
      basePath: "OEBPS/ch1.xhtml",
      strictXml: true,
      urlFor: (p) => (p.includes("missing") ? undefined : `blob:test/${p}`),
      settings: DEFAULT_SETTINGS,
    });

  it("SVG 内嵌 script 与 onload 清除", async () => {
    const { html } = await san(
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:svg="http://www.w3.org/2000/svg"><body>
<svg onload="evil()"><script>alert(1)</script><circle r="1"/></svg>
</body></html>`
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onload");
    expect(html).toContain("<circle");
  });

  it("data: URI 图片保留（不写 blob）", async () => {
    const { html } = await san(
      `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<img src="data:image/png;base64,iVBORw0KGgo="/>
</body></html>`
    );
    expect(html).toContain("data:image/png");
    expect(html).not.toContain("blob:test/");
  });

  it("非样式表 link（preload/icon）被移除", async () => {
    const { html } = await san(
      `<html xmlns="http://www.w3.org/1999/xhtml"><head>
<link rel="preload" href="x.ttf" as="font"/>
<link rel="icon" href="f.ico"/>
</head><body>正文</body></html>`
    );
    expect(html).not.toContain("preload");
    expect(html).not.toContain("icon");
  });
});
