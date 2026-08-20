import { describe, expect, it } from "vitest";
import {
  emptyReaderNavigationHistory,
  readerHistoryBack,
  recordReaderNavigation,
  type ReaderNavigationPosition,
} from "./readerNavigationHistory";
import {
  commitDirectHistory,
  commitHistoryTransition,
  sameChapterRoute,
} from "./sameChapterNavigation";

const position = (spineIndex: number, page: number): ReaderNavigationPosition => ({
  spineIndex,
  page,
  anchor: { index: page, ratio: 0.5 },
});

describe("same-chapter navigation routing and history transactions", () => {
  it("uses direct only for the current ready chapter", () => {
    expect(
      sameChapterRoute({
        currentSpineIndex: 2,
        targetSpineIndex: 2,
        readerDisplayReady: true,
        navigationPending: false,
      })
    ).toBe("direct");
    expect(
      sameChapterRoute({
        currentSpineIndex: 2,
        targetSpineIndex: 2,
        readerDisplayReady: false,
        navigationPending: false,
      })
    ).toBe("reload");
    expect(
      sameChapterRoute({
        currentSpineIndex: 2,
        targetSpineIndex: 3,
        readerDisplayReady: true,
        navigationPending: false,
      })
    ).toBe("reload");
  });

  it("does not commit a direct history snapshot after failure", () => {
    const history = emptyReaderNavigationHistory();
    const snapshot = position(1, 4);
    expect(commitDirectHistory(history, snapshot, false)).toEqual(history);
    expect(commitDirectHistory(history, snapshot, true).back).toHaveLength(1);
  });

  it("adopts back transition only after direct success", () => {
    const current = position(0, 3);
    const history = recordReaderNavigation(
      recordReaderNavigation(emptyReaderNavigationHistory(), position(0, 1)),
      position(0, 2)
    );
    const transition = readerHistoryBack(history, current);
    expect(commitHistoryTransition(history, transition, false)).toEqual(history);
    expect(commitHistoryTransition(history, transition, true)).toEqual(transition.history);
  });
});
