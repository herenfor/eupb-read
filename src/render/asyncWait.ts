export type WaitOutcome = "ready" | "raf" | "timeout" | "aborted";

interface WaitOptions {
  signal: AbortSignal;
  timeoutMs: number;
  setTimeout?: (callback: () => void, ms: number) => number;
  clearTimeout?: (handle: number) => void;
}

function timerApi(options: WaitOptions): Required<Pick<WaitOptions, "setTimeout" | "clearTimeout">> {
  return {
    setTimeout: options.setTimeout ?? ((callback, ms) => globalThis.setTimeout(callback, ms) as unknown as number),
    clearTimeout: options.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)),
  };
}

export function waitForFontsReady(
  fonts: PromiseLike<unknown>,
  options: WaitOptions
): Promise<WaitOutcome> {
  const { setTimeout, clearTimeout } = timerApi(options);
  if (options.signal.aborted) return Promise.resolve("aborted");
  return new Promise((resolve) => {
    let settled = false;
    let timer: number | undefined;
    const finish = (outcome: WaitOutcome): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      options.signal.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onAbort = (): void => finish("aborted");
    options.signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => finish("timeout"), options.timeoutMs);
    // A rejected FontFaceSet is non-fatal: existing paginator behavior is to
    // continue after the same timeout boundary, so treat rejection as ready.
    Promise.resolve(fonts).then(
      () => finish("ready"),
      () => finish("ready")
    );
  });
}

export function waitForDoubleRaf(options: WaitOptions & {
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
}): Promise<WaitOutcome> {
  const { setTimeout, clearTimeout } = timerApi(options);
  const host = globalThis as typeof globalThis & {
    requestAnimationFrame?: (callback: FrameRequestCallback) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  const request =
    options.requestAnimationFrame ??
    host.requestAnimationFrame?.bind(host) ??
    ((callback) => globalThis.setTimeout(() => callback(0), 16) as unknown as number);
  const cancel =
    options.cancelAnimationFrame ??
    host.cancelAnimationFrame?.bind(host) ??
    ((handle) => globalThis.clearTimeout(handle as unknown as ReturnType<typeof setTimeout>));
  if (options.signal.aborted) return Promise.resolve("aborted");
  return new Promise((resolve) => {
    let settled = false;
    let timer: number | undefined;
    let first: number | undefined;
    let second: number | undefined;
    const finish = (outcome: WaitOutcome): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (first !== undefined) cancel(first);
      if (second !== undefined) cancel(second);
      options.signal.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onAbort = (): void => finish("aborted");
    options.signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => finish("timeout"), options.timeoutMs);
    first = request(() => {
      first = undefined;
      second = request(() => {
        second = undefined;
        finish("raf");
      });
    });
  });
}
