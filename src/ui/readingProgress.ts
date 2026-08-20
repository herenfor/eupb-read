/** Current-chapter numerator only; full-book denominator remains App-owned. */
export function currentChapterCharsRead({
  textOffset,
  page,
  pageCount,
  chapterChars,
}: {
  textOffset: number | null | undefined;
  page: number;
  pageCount: number;
  chapterChars: number;
}): number {
  if (typeof textOffset === "number" && Number.isSafeInteger(textOffset) && textOffset >= 0) {
    return textOffset;
  }
  if (pageCount > 0) return ((page + 1) / pageCount) * chapterChars;
  return 0;
}
