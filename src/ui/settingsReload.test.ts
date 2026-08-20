import { describe, expect, it, vi } from "vitest";
import { createSettingsReloadDebouncer } from "./settingsReload";

describe("settings reload debounce", () => {
  it("coalesces rapid settings changes and runs only the latest task", () => {
    vi.useFakeTimers();
    try {
      const reload = vi.fn();
      const debouncer = createSettingsReloadDebouncer(150);
      debouncer.schedule(() => reload("font+1"));
      debouncer.schedule(() => reload("font+2"));
      vi.advanceTimersByTime(149);
      expect(reload).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledWith("font+2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending settings reload when the chapter changes", () => {
    vi.useFakeTimers();
    try {
      const reload = vi.fn();
      const debouncer = createSettingsReloadDebouncer(150);
      debouncer.schedule(reload);
      debouncer.cancel();
      vi.advanceTimersByTime(200);
      expect(reload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
