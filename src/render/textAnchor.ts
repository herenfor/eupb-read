/**
 * Content-text anchors are deliberately independent of pagination.  This
 * module only observes the chapter DOM and maps normalized text positions to
 * text nodes; it never writes DOM/style values or changes layout.
 */

export const MAX_ANCHOR_SNIPPET_CODE_POINTS = 32;
export const MAX_ANCHOR_TEXT_OFFSET = Number.MAX_SAFE_INTEGER;

export interface TextAnchorData {
  textOffset: number | null;
  textSnippet: string | null;
}

export interface TextNodePosition {
  node: Text;
  /** DOM Range offsets are UTF-16 code units. */
  rawOffset: number;
}

interface IndexedTextNode {
  node: Text;
  start: number;
  end: number;
  /** UTF-16 offset for each normalized Unicode code point. */
  rawStarts: number[];
  rawEnds: number[];
  rawEnd: number;
}

const WHITESPACE = /\p{White_Space}/u;

function isWhitespace(value: string): boolean {
  return WHITESPACE.test(value);
}

/** The stable persisted representation: Unicode code points, no whitespace. */
export function normalizeAnchorText(value: string): string {
  return Array.from(value).filter((codePoint) => !isWhitespace(codePoint)).join("");
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

function validOffset(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_ANCHOR_TEXT_OFFSET
  );
}

function validSnippet(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    codePointLength(value) <= MAX_ANCHOR_SNIPPET_CODE_POINTS &&
    normalizeAnchorText(value) === value
  );
}

/**
 * Old JSON may omit these optional keys. New writes use null, while invalid
 * values are discarded as a pair so a hostile snippet cannot affect recovery.
 */
export function sanitizePersistedTextAnchor(value: unknown): TextAnchorData {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const textOffset = input.textOffset;
  const textSnippet = input.textSnippet;
  if (textOffset === undefined && textSnippet === undefined) {
    return { textOffset: null, textSnippet: null };
  }
  if (textOffset !== null && !validOffset(textOffset)) {
    return { textOffset: null, textSnippet: null };
  }
  if (textSnippet !== null && !validSnippet(textSnippet)) {
    return { textOffset: null, textSnippet: null };
  }
  if (textOffset === null && textSnippet !== null) {
    return { textOffset: null, textSnippet: null };
  }
  return {
    textOffset: textOffset === undefined || textOffset === null ? null : textOffset,
    textSnippet: textSnippet === undefined || textSnippet === null ? null : textSnippet,
  };
}

export function isExplicitFootnote(element: Element): boolean {
  if (element.closest("note aside, aside[epub\\:type~='footnote']")) return true;
  const epubType = element.getAttribute("epub:type") ?? "";
  return /(?:^|\s)footnote(?:\s|$)/i.test(epubType);
}

/** Structural visibility shared by provisional chapter scans and measured anchors. */
export function isStructurallyHiddenElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  return (
    tag === "script" ||
    tag === "style" ||
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden")?.trim().toLowerCase() === "true" ||
    isExplicitFootnote(element)
  );
}

export function hasStructurallyExcludedAncestor(node: Node): boolean {
  let current = node.parentElement;
  while (current) {
    if (isStructurallyHiddenElement(current)) return true;
    current = current.parentElement;
  }
  return false;
}

function isVisibleTextNode(
  node: Text,
  doc: Document,
  hiddenCache: WeakMap<Element, boolean>,
): boolean {
  if (!node.data || normalizeAnchorText(node.data) === "") return false;
  let current = node.parentElement;
  while (current) {
    const cached = hiddenCache.get(current);
    if (cached === true) return false;
    if (cached === undefined) {
      let hidden = isStructurallyHiddenElement(current);
      if (!hidden) {
        try {
          const computed = doc.defaultView?.getComputedStyle(current);
          hidden =
            computed?.display === "none" ||
            computed?.visibility === "hidden" ||
            computed?.visibility === "collapse";
        } catch {
          // A detached/old document is handled by the paginator lifecycle.
        }
      }
      hiddenCache.set(current, hidden);
      if (hidden) return false;
    }
    current = current.parentElement;
  }
  return true;
}

export class VisibleTextIndex {
  readonly text: string;
  readonly codePoints: string[];
  readonly totalChars: number;
  private readonly nodes: IndexedTextNode[];
  private readonly nodeMap: Map<Text, IndexedTextNode>;

  constructor(nodes: IndexedTextNode[], text: string) {
    this.nodes = nodes;
    this.nodeMap = new Map(nodes.map((item) => [item.node, item]));
    this.text = text;
    this.codePoints = Array.from(text);
    this.totalChars = this.codePoints.length;
  }

  offsetForNode(node: Node, rawOffset: number): number | null {
    if (node.nodeType !== 3) return null;
    const item = this.nodeMap.get(node as Text);
    if (!item || !Number.isFinite(rawOffset)) return null;
    const raw = Math.max(0, Math.min(item.rawEnd, Math.floor(rawOffset)));
    for (let i = 0; i < item.rawStarts.length; i++) {
      // A defensive caller could hand us an offset in the middle of a
      // surrogate pair. Map it to the code point boundary before that pair;
      // persisted positions never split a Unicode character.
      if (raw <= item.rawStarts[i] || raw < item.rawEnds[i]) return item.start + i;
    }
    return item.end;
  }

  positionForOffset(offset: number): TextNodePosition | null {
    if (!validOffset(offset) || offset > this.totalChars || this.nodes.length === 0) return null;
    const item = this.nodes.find((candidate) => offset >= candidate.start && offset < candidate.end)
      ?? (offset === this.totalChars ? this.nodes.at(-1) : undefined);
    if (!item) return null;
    if (offset === item.end) return { node: item.node, rawOffset: item.rawEnd };
    return { node: item.node, rawOffset: item.rawStarts[offset - item.start] ?? item.rawEnd };
  }

  snippetAt(offset: number): string | null {
    if (!validOffset(offset) || offset >= this.totalChars) return null;
    return this.codePoints.slice(offset, offset + MAX_ANCHOR_SNIPPET_CODE_POINTS).join("") || null;
  }
}

/** Build once per valid current chapter document; callers own invalidation. */
export function buildVisibleTextIndex(doc: Document, viewer: HTMLElement): VisibleTextIndex {
  // SHOW_TEXT is 4. Referencing the numeric DOM constant keeps this helper
  // usable in minimal DOM test implementations that do not expose NodeFilter.
  const walker = doc.createTreeWalker(viewer, 4);
  const nodes: IndexedTextNode[] = [];
  const pieces: string[] = [];
  const hiddenCache = new WeakMap<Element, boolean>();
  let normalizedOffset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!isVisibleTextNode(text, doc, hiddenCache)) continue;
    const rawStarts: number[] = [];
    const rawEnds: number[] = [];
    let rawOffset = 0;
    let normalized = "";
    for (const codePoint of Array.from(text.data)) {
      if (!isWhitespace(codePoint)) {
        rawStarts.push(rawOffset);
        rawEnds.push(rawOffset + codePoint.length);
        normalized += codePoint;
      }
      rawOffset += codePoint.length;
    }
    if (!normalized) continue;
    nodes.push({
      node: text,
      start: normalizedOffset,
      end: normalizedOffset + rawStarts.length,
      rawStarts,
      rawEnds,
      rawEnd: text.data.length,
    });
    normalizedOffset += rawStarts.length;
    pieces.push(normalized);
  }
  return new VisibleTextIndex(nodes, pieces.join(""));
}

function matchesAt(haystack: readonly string[], needle: readonly string[], start: number): boolean {
  for (let i = 0; i < needle.length; i++) {
    if (haystack[start + i] !== needle[i]) return false;
  }
  return true;
}

/**
 * Returns the exact offset when the snippet still validates it. A bounded
 * snippet means the fallback scan is O(chapter characters), not O(n²).
 */
export function resolveTextAnchorOffset(index: VisibleTextIndex, anchor: TextAnchorData): number | null {
  const { textOffset, textSnippet } = sanitizePersistedTextAnchor(anchor);
  if (textOffset === null || textOffset > index.totalChars) return null;
  if (!textSnippet) return textOffset;
  const needle = Array.from(textSnippet);
  if (matchesAt(index.codePoints, needle, textOffset)) return textOffset;
  if (needle.length > index.totalChars) return null;
  let nearest: number | null = null;
  for (let start = 0; start <= index.totalChars - needle.length; start++) {
    if (!matchesAt(index.codePoints, needle, start)) continue;
    if (
      nearest === null ||
      Math.abs(start - textOffset) < Math.abs(nearest - textOffset)
    ) {
      nearest = start;
    }
  }
  return nearest;
}
