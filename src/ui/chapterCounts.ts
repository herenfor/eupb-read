export type ChapterCountSource = "unknown" | "estimated" | "measured";

export interface ChapterCount {
  value: number | null;
  source: ChapterCountSource;
}

export interface ChapterCountCollection {
  generation: number;
  linear: readonly boolean[];
  counts: readonly ChapterCount[];
}

export interface ChapterCountSummary {
  total: number;
  before: number;
  current: number | null;
  complete: boolean;
  approximate: boolean;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Keep the persisted shelf baseline while an exact percentage is unavailable. */
export function resolveProgressPct(exact: number | null, baseline: number): number {
  return exact === null || !Number.isFinite(exact)
    ? clampProgress(baseline)
    : clampProgress(exact);
}

export function createChapterCountCollection(
  generation: number,
  linear: readonly boolean[]
): ChapterCountCollection {
  return {
    generation,
    linear: [...linear],
    counts: linear.map(() => ({ value: null, source: "unknown" as const })),
  };
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && Number.isFinite(value) && value >= 0;
}

export function applyChapterCount(
  collection: ChapterCountCollection,
  generation: number,
  index: number,
  value: number,
  source: Exclude<ChapterCountSource, "unknown">
): { accepted: boolean; collection: ChapterCountCollection } {
  if (
    generation !== collection.generation ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= collection.counts.length ||
    !validCount(value)
  ) {
    return { accepted: false, collection };
  }
  const previous = collection.counts[index];
  if (previous.source === "measured" && source === "estimated") {
    return { accepted: false, collection };
  }
  const counts = collection.counts.slice();
  counts[index] = { value, source };
  return {
    accepted: true,
    collection: { ...collection, counts },
  };
}

function addCount(total: number, value: number): number {
  const next = total + value;
  return Number.isSafeInteger(next) ? next : Number.MAX_SAFE_INTEGER;
}

export function summarizeLinearCounts(
  collection: ChapterCountCollection,
  currentIndex: number
): ChapterCountSummary {
  let total = 0;
  let before = 0;
  let complete = true;
  let approximate = false;
  for (let index = 0; index < collection.counts.length; index++) {
    if (!collection.linear[index]) continue;
    const count = collection.counts[index];
    if (count.value === null) {
      complete = false;
      continue;
    }
    total = addCount(total, count.value);
    if (index < currentIndex) before = addCount(before, count.value);
    if (count.source === "estimated") approximate = true;
  }
  const current =
    currentIndex >= 0 && currentIndex < collection.counts.length && collection.linear[currentIndex]
      ? collection.counts[currentIndex].value
      : null;
  return { total, before, current, complete, approximate };
}

export function computeProgressPct(
  summary: ChapterCountSummary,
  currentRead: number
): number | null {
  if (!summary.complete || summary.total <= 0 || !validCount(summary.total)) return null;
  if (!Number.isFinite(currentRead) || currentRead < 0) return null;
  const current = summary.current ?? 0;
  const numerator = Math.min(summary.total, summary.before + Math.min(current, currentRead));
  return Math.max(0, Math.min(100, Math.round((numerator / summary.total) * 100)));
}
