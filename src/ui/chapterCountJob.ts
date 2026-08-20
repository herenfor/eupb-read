import { resolvePath } from "../core/paths";
import type { Book } from "../core/types";
import {
  hasStructurallyExcludedAncestor,
  normalizeAnchorText,
} from "../render/textAnchor";

export interface IdleScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function createDefaultIdleScheduler(): IdleScheduler {
  const host = globalThis as unknown as IdleWindow;
  if (typeof host.requestIdleCallback === "function") {
    return {
      request(callback) {
        return host.requestIdleCallback!(callback, { timeout: 500 });
      },
      cancel(handle) {
        host.cancelIdleCallback?.(handle);
      },
    };
  }
  return {
    request(callback) {
      return globalThis.setTimeout(callback, 16) as unknown as number;
    },
    cancel(handle) {
      globalThis.clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    },
  };
}

export interface ChapterCountJobServer {
  textFor(path: string): string | undefined;
}

export interface ChapterCountJobOptions {
  book: Book;
  server: ChapterCountJobServer;
  generation: number;
  scheduler?: IdleScheduler;
  /** Must verify the active session generation and exact book/server identity. */
  isCurrent?: (generation: number, book: Book, server: ChapterCountJobServer) => boolean;
  parse?: (text: string) => Document;
  onCount(index: number, value: number): void;
  onIssue?(message: string): void;
}

function defaultParse(text: string): Document {
  if (typeof DOMParser === "undefined") throw new Error("DOMParser unavailable");
  const doc = new DOMParser().parseFromString(text, "text/html");
  if (!doc) throw new Error("DOMParser returned no document");
  return doc;
}

function countStructuralText(doc: Document): number {
  const root = doc.body ?? doc.documentElement;
  if (!root) return 0;
  const walker = doc.createTreeWalker(root, 4);
  let total = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (hasStructurallyExcludedAncestor(node)) continue;
    total += Array.from(normalizeAnchorText(node.textContent ?? "")).length;
  }
  return Number.isSafeInteger(total) ? total : Number.MAX_SAFE_INTEGER;
}

export function createChapterCountJob(options: ChapterCountJobOptions): { cancel(): void } {
  const scheduler = options.scheduler ?? createDefaultIdleScheduler();
  const controller = new AbortController();
  const indices = options.book.spine
    .map((item, index) => (item.linear ? index : -1))
    .filter((index) => index >= 0);
  let cursor = 0;
  let scheduled: number | null = null;

  const current = (): boolean =>
    !controller.signal.aborted &&
    (options.isCurrent?.(options.generation, options.book, options.server) ?? true);

  const schedule = (): void => {
    if (!current() || cursor >= indices.length || scheduled !== null) return;
    scheduled = scheduler.request(() => {
      scheduled = null;
      if (!current()) return;
      const index = indices[cursor++];
      let value = 0;
      let issue: string | undefined;
      try {
        const item = options.book.spine[index];
        const manifest = options.book.manifest.get(item.idref);
        if (!manifest) {
          issue = `chapter ${index}: manifest item missing`;
        } else {
          const path = resolvePath(options.book.opfPath, manifest.href);
          const text = options.server.textFor(path);
          if (text === undefined) {
            issue = `chapter ${index}: text resource missing (${path})`;
          } else {
            value = countStructuralText((options.parse ?? defaultParse)(text));
          }
        }
      } catch (error) {
        issue = `chapter ${index}: ${error instanceof Error ? error.message : String(error)}`;
        value = 0;
      }
      if (!current()) return;
      options.onCount(index, value);
      if (issue && options.onIssue && current()) options.onIssue(issue);
      schedule();
    });
  };

  const cancel = (): void => {
    if (controller.signal.aborted) return;
    controller.abort();
    if (scheduled !== null) {
      scheduler.cancel(scheduled);
      scheduled = null;
    }
  };
  schedule();
  return { cancel };
}
