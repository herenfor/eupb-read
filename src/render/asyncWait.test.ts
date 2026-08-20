import { describe, expect, it, vi } from "vitest";
import { waitForDoubleRaf, waitForFontsReady } from "./asyncWait";

describe("cancellable paginator waits", () => {
  it("clears the timeout when fonts win, and treats task rejection as ready", async () => {
    vi.useFakeTimers();
    try {
      const clear = vi.spyOn(globalThis, "clearTimeout");
      const controller = new AbortController();
      const fonts = Promise.resolve();
      await expect(waitForFontsReady(fonts, { signal: controller.signal, timeoutMs: 50 })).resolves.toBe("ready");
      expect(clear).toHaveBeenCalled();
      const rejected = Promise.reject(new Error("font task failed"));
      await expect(waitForFontsReady(rejected, { signal: controller.signal, timeoutMs: 50 })).resolves.toBe("ready");
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves on the second frame and clears its timeout", async () => {
    vi.useFakeTimers();
    try {
      const clear = vi.spyOn(globalThis, "clearTimeout");
      const callbacks: FrameRequestCallback[] = [];
      let next = 0;
      const controller = new AbortController();
      const pending = waitForDoubleRaf({
        signal: controller.signal,
        timeoutMs: 50,
        requestAnimationFrame: (callback) => {
          callbacks.push(callback);
          return ++next;
        },
        cancelAnimationFrame: () => {},
      });
      callbacks.shift()!(0);
      callbacks.shift()!(0);
      await expect(pending).resolves.toBe("raf");
      expect(clear).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the second frame when abort happens after the first frame", async () => {
    vi.useFakeTimers();
    try {
      const aborted = new AbortController();
      const callbacks: FrameRequestCallback[] = [];
      const cancel = vi.fn();
      let next = 0;
      const pending = waitForDoubleRaf({
        signal: aborted.signal,
        timeoutMs: 50,
        requestAnimationFrame: (callback) => {
          callbacks.push(callback);
          return ++next;
        },
        cancelAnimationFrame: cancel,
      });
      callbacks.shift()!(0);
      aborted.abort();
      await expect(pending).resolves.toBe("aborted");
      expect(cancel).toHaveBeenCalledWith(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
