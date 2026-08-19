import { describe, expect, it, vi } from "vitest";
import {
  ThumbnailTaskQueue,
  deriveThumbnail,
  thumbnailMimeFor,
  thumbnailSize,
} from "./thumbnail";

describe("thumbnailSize", () => {
  it("keeps aspect ratio and stays inside 240×360", () => {
    expect(thumbnailSize(1200, 800)).toEqual({ width: 240, height: 160 });
    expect(thumbnailSize(800, 1200)).toEqual({ width: 240, height: 360 });
    expect(thumbnailSize(100, 100)).toEqual({ width: 100, height: 100 });
    expect(thumbnailSize(0, 100)).toBeNull();
  });
});

describe("thumbnailMimeFor", () => {
  it("uses JPEG for JPEG sources and WebP otherwise", () => {
    expect(thumbnailMimeFor("image/jpeg")).toBe("image/jpeg");
    expect(thumbnailMimeFor("image/png")).toBe("image/webp");
  });
});

describe("deriveThumbnail", () => {
  it("decodes SVG through the isolated image path instead of rejecting its MIME", async () => {
    const createObjectURL = vi.fn(() => "blob:cover");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    class FakeImage {
      naturalWidth = 100;
      naturalHeight = 200;
      src = "";
      async decode(): Promise<void> {
        // Blob URL image decoding is the isolation boundary under test.
      }
    }
    vi.stubGlobal("Image", FakeImage);

    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob(callback: BlobCallback, mime?: string): void {
        callback(new Blob(["derived"], { type: mime }));
      },
    };
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });

    const result = await deriveThumbnail({
      bytes: new Uint8Array([60, 115, 118, 103, 62]),
      mime: "image/svg+xml",
    });

    expect(result?.mime).toBe("image/webp");
    expect(result?.bytes.byteLength).toBeGreaterThan(0);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(200);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover");
    vi.unstubAllGlobals();
  });
});

describe("ThumbnailTaskQueue", () => {
  it("never runs more than four tasks at once", async () => {
    const queue = new ThumbnailTaskQueue(4);
    let active = 0;
    let maximum = 0;
    const tasks = Array.from({ length: 12 }, (_, index) =>
      queue.enqueue(
        async () => {
          active += 1;
          maximum = Math.max(maximum, active);
          await new Promise((resolve) => setTimeout(resolve, index % 2));
          active -= 1;
          return index;
        }
      )
    );
    await expect(Promise.all(tasks)).resolves.toHaveLength(12);
    expect(maximum).toBe(4);
    expect(queue.activeCount).toBe(0);
    expect(queue.pendingCount).toBe(0);
  });

  it("cancels queued work before it starts", async () => {
    const queue = new ThumbnailTaskQueue(1);
    const release = defer();
    const first = queue.enqueue(async () => {
      await release.promise;
    });
    const controller = new AbortController();
    const secondTask = vi.fn(async () => "never");
    const second = queue.enqueue(secondTask, controller.signal);
    controller.abort();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    release.resolve();
    await first;
    expect(secondTask).not.toHaveBeenCalled();
  });
});

function defer(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
