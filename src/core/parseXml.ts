/**
 * 跨环境 XML 解析：浏览器用 DOMParser，Node（测试）用 @xmldom/xmldom。
 * 解析失败的检测由调用方通过 hasParserError 完成。
 */

type ParserCtor = new (
  options?: { errorHandler?: Record<string, () => void> }
) => { parseFromString(xml: string, mimeType?: string): Document };

let nodeParser: ParserCtor | null = null;

async function getParser(): Promise<ParserCtor> {
  if (typeof DOMParser !== "undefined") {
    return DOMParser as unknown as ParserCtor;
  }
  if (!nodeParser) {
    const mod = await import("@xmldom/xmldom");
    nodeParser = mod.DOMParser as unknown as ParserCtor;
  }
  return nodeParser;
}

/**
 * 解析 XML 文本。mime 传 "application/xml"（严格）或 "text/html"（宽松）。
 * 返回 Document；解析失败时文档中会含 <parsererror>，用 hasParserError 检测。
 */
export async function parseXmlText(
  xml: string,
  mime: "application/xml" | "text/html" = "application/xml"
): Promise<Document> {
  const Parser = await getParser();
  if (typeof DOMParser !== "undefined") {
    // 浏览器：DOMParser 失败时原生注入 <parsererror>
    return new DOMParser().parseFromString(xml, mime as DOMParserSupportedType);
  }
  // Node：xmldom 需要自行捕获 fatalError 并注入 <parsererror>
  let failed = false;
  const parser = new Parser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: () => {
        failed = true;
      },
    },
  });
  const doc = parser.parseFromString(xml, mime);
  if (failed) {
    // xmldom 不注入 <parsererror>，用标记属性代替（hasParserError 会检查）
    try {
      (doc as unknown as { __parserFailed?: boolean }).__parserFailed = true;
    } catch {
      /* ignore */
    }
  }
  return doc;
}

/** 检测 XML 解析是否失败（DOMParser 注入 parsererror，xmldom 用标记属性）。 */
export function hasParserError(doc: Document): boolean {
  if (doc.getElementsByTagName("parsererror").length > 0) return true;
  return (doc as unknown as { __parserFailed?: boolean }).__parserFailed === true;
}

let nodeSerializer: { serializeToString(node: unknown): string } | null = null;

/** 跨环境序列化器：浏览器用 XMLSerializer，Node 用 @xmldom/xmldom。 */
export async function getSerializer(): Promise<{ serializeToString(node: unknown): string }> {
  if (typeof XMLSerializer !== "undefined") {
    return new XMLSerializer();
  }
  if (!nodeSerializer) {
    const mod = await import("@xmldom/xmldom");
    nodeSerializer = new mod.XMLSerializer();
  }
  return nodeSerializer;
}
