export interface SettingsReloadDebouncer {
  schedule(task: () => void): void;
  cancel(): void;
}

/** Coalesce rapid setting changes; the caller supplies the latest task closure. */
export function createSettingsReloadDebouncer(delayMs = 150): SettingsReloadDebouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;
  return {
    schedule(task) {
      if (timer !== null) clearTimeout(timer);
      pending = task;
      timer = setTimeout(() => {
        timer = null;
        const run = pending;
        pending = null;
        run?.();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
