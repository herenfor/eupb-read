import {
  recordReaderNavigation,
  type ReaderNavigationHistory,
  type ReaderNavigationPosition,
  type HistoryTransition,
} from "./readerNavigationHistory";

export type SameChapterRoute = "direct" | "reload";

/** Pure App routing decision; cross-chapter and not-ready paths retain reload semantics. */
export function sameChapterRoute({
  currentSpineIndex,
  targetSpineIndex,
  readerDisplayReady,
  navigationPending,
}: {
  currentSpineIndex: number;
  targetSpineIndex: number;
  readerDisplayReady: boolean;
  navigationPending: boolean;
}): SameChapterRoute {
  return currentSpineIndex === targetSpineIndex && readerDisplayReady && !navigationPending
    ? "direct"
    : "reload";
}

/** Commit a TOC/bookmark snapshot only after the direct operation succeeded. */
export function commitDirectHistory(
  history: ReaderNavigationHistory,
  snapshot: ReaderNavigationPosition,
  directSucceeded: boolean
): ReaderNavigationHistory {
  return directSucceeded ? recordReaderNavigation(history, snapshot) : history;
}

/** Back/forward transition is adopted only after the direct restore succeeds. */
export function commitHistoryTransition(
  history: ReaderNavigationHistory,
  transition: HistoryTransition,
  directSucceeded: boolean
): ReaderNavigationHistory {
  return directSucceeded && transition.target ? transition.history : history;
}
