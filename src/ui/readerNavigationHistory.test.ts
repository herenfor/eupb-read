import { describe, expect, it } from "vitest";
import {
  emptyReaderNavigationHistory,
  readerHistoryBack,
  readerHistoryForward,
  recordReaderNavigation,
  type ReaderNavigationPosition,
} from "./readerNavigationHistory";

const pos = (page: number): ReaderNavigationPosition => ({
  spineIndex: 0,
  page,
  anchor: { index: page, ratio: 0.5 },
});

describe("reader navigation history", () => {
  it("bounds new navigation to three back entries and clears forward", () => {
    let history = emptyReaderNavigationHistory();
    history = recordReaderNavigation(history, pos(1));
    history = recordReaderNavigation(history, pos(2));
    history = recordReaderNavigation(history, pos(3));
    history = recordReaderNavigation(history, pos(4));
    expect(history.back.map((item) => item.page)).toEqual([2, 3, 4]);
    expect(history.forward).toEqual([]);
  });

  it("exchanges current position symmetrically on back and forward", () => {
    let history = emptyReaderNavigationHistory();
    history = recordReaderNavigation(history, pos(1));
    history = recordReaderNavigation(history, pos(2));
    const back = readerHistoryBack(history, pos(3));
    expect(back.target?.page).toBe(2);
    expect(back.history.back.map((item) => item.page)).toEqual([1]);
    expect(back.history.forward.map((item) => item.page)).toEqual([3]);
    const forward = readerHistoryForward(back.history, pos(2));
    expect(forward.target?.page).toBe(3);
    expect(forward.history.back.map((item) => item.page)).toEqual([1, 2]);
    expect(forward.history.forward).toEqual([]);
  });

  it("does not mutate source positions or state", () => {
    const current = pos(1);
    const history = recordReaderNavigation(emptyReaderNavigationHistory(), current);
    current.anchor!.index = 99;
    expect(history.back[0].anchor?.index).toBe(1);
    expect(readerHistoryBack(emptyReaderNavigationHistory(), pos(1)).target).toBeNull();
    expect(readerHistoryForward(emptyReaderNavigationHistory(), pos(1)).target).toBeNull();
  });
});
