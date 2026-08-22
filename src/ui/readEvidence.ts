/**
 * Reading evidence is intentionally independent from the exact full-book
 * percentage.  During the opening scan the percentage may still be a saved
 * baseline, while a page/anchor is already a real stable position.
 */
export interface ReadingEvidenceInput {
  isNew?: boolean;
  progressPct?: number;
  spineIndex?: number;
  page?: number;
  anchorIndex?: number | null;
  anchorRatio?: number | null;
  anchorTextOffset?: number | null;
  anchorTextSnippet?: string | null;
  lastReadAtMs?: number;
  addedAtMs?: number;
}

function positiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validLegacyAnchor(input: ReadingEvidenceInput): boolean {
  return (
    typeof input.anchorIndex === "number" &&
    Number.isSafeInteger(input.anchorIndex) &&
    input.anchorIndex >= 0 &&
    typeof input.anchorRatio === "number" &&
    Number.isFinite(input.anchorRatio) &&
    input.anchorRatio >= 0 &&
    input.anchorRatio <= 1
  );
}

function validTextAnchor(input: ReadingEvidenceInput): boolean {
  return (
    typeof input.anchorTextOffset === "number" &&
    Number.isSafeInteger(input.anchorTextOffset) &&
    input.anchorTextOffset >= 0
  );
}

/** Whether a record contains a persisted position that proves it was opened/read. */
export function hasReadPosition(input: ReadingEvidenceInput): boolean {
  if (input.isNew === false) return true;
  if (positiveInteger(input.progressPct)) return true;
  if (positiveInteger(input.spineIndex) || positiveInteger(input.page)) return true;
  if (validLegacyAnchor(input) || validTextAnchor(input)) return true;
  // New records use 0 until the first stable position.  A later timestamp is
  // useful evidence for older records that did not carry isNew consistently.
  return (
    typeof input.lastReadAtMs === "number" &&
    Number.isFinite(input.lastReadAtMs) &&
    typeof input.addedAtMs === "number" &&
    Number.isFinite(input.addedAtMs) &&
    input.lastReadAtMs > input.addedAtMs
  );
}

/** Alias used by archive merge code to make the semantic decision explicit. */
export const hasReadEvidence = hasReadPosition;
