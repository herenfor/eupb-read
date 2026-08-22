import { describe, expect, it } from "vitest";
import { FOOTNOTE_HOVER_CLOSE_GRACE_MS, FootnoteHoverGate, type FootnoteHoverScheduler } from "./footnoteHoverGate";

function fakeScheduler() {
  let nextId = 0;
  const callbacks = new Map<number, () => void>();
  const scheduler: FootnoteHoverScheduler = {
    schedule: (callback, delayMs) => {
      expect(delayMs).toBe(FOOTNOTE_HOVER_CLOSE_GRACE_MS);
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancel: (handle) => callbacks.delete(handle as number),
  };
  return {
    scheduler,
    pending: () => callbacks.size,
    flush: () => {
      for (const [id, callback] of Array.from(callbacks)) {
        callbacks.delete(id);
        callback();
      }
    },
  };
}

describe("FootnoteHoverGate", () => {
  it("gracefully bridges marker leave to overlay enter", () => {
    const fake = fakeScheduler();
    let closes = 0;
    const gate = new FootnoteHoverGate(() => closes++, fake.scheduler);
    gate.show(false);
    gate.markerEnter();
    gate.markerLeave();
    expect(fake.pending()).toBe(1);
    gate.overlayEnter();
    expect(fake.pending()).toBe(0);
    gate.overlayLeave();
    expect(fake.pending()).toBe(1);
    fake.flush();
    expect(closes).toBe(1);
  });

  it("closes once after both domains leave and does not stack timers", () => {
    const fake = fakeScheduler();
    let closes = 0;
    const gate = new FootnoteHoverGate(() => closes++, fake.scheduler);
    gate.show(false);
    gate.markerEnter();
    gate.markerLeave();
    gate.markerLeave();
    expect(fake.pending()).toBe(1);
    fake.flush();
    expect(closes).toBe(1);
    gate.markerLeave();
    expect(fake.pending()).toBe(0);
    expect(closes).toBe(1);
  });

  it("cancels close while pinned and supports unpinning", () => {
    const fake = fakeScheduler();
    let closes = 0;
    const gate = new FootnoteHoverGate(() => closes++, fake.scheduler);
    gate.show(true);
    gate.markerLeave();
    expect(fake.pending()).toBe(0);
    gate.setPinned(false);
    expect(fake.pending()).toBe(1);
    fake.flush();
    expect(closes).toBe(1);
  });

  it("reset and dispose clear timers and prevent later close", () => {
    const fake = fakeScheduler();
    let closes = 0;
    const gate = new FootnoteHoverGate(() => closes++, fake.scheduler);
    gate.show(false);
    gate.markerLeave();
    gate.reset();
    expect(fake.pending()).toBe(0);
    fake.flush();
    expect(closes).toBe(0);
    gate.show(false);
    gate.markerLeave();
    gate.dispose();
    fake.flush();
    expect(closes).toBe(0);
  });
});
