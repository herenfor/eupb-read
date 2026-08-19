import {
  getShelfStore,
  type ShelfEntry,
} from "./shelf";

/** A short-lived image payload. Callers must not retain source cover bytes. */
export interface ThumbnailAsset {
  bytes: Uint8Array;
  mime: string;
}

/** Fields the native provider needs to find cache and source cover data. */
export interface ThumbnailDescriptor {
  id: string;
  contentHash?: string;
  coverMime?: string;
  thumbnailMime?: string;
}

/**
 * The UI deliberately knows nothing about the cache directory or EPUB paths.
 * Native implementations may use contentHash for the derived cache key and id
 * for their validated device binding.
 */
export interface ThumbnailProvider {
  readCachedThumbnail(descriptor: ThumbnailDescriptor): Promise<ThumbnailAsset | null>;
  readSourceCover(descriptor: ThumbnailDescriptor): Promise<ThumbnailAsset | null>;
  writeDerivedThumbnail(
    descriptor: ThumbnailDescriptor,
    asset: ThumbnailAsset
  ): Promise<void>;
}

export function descriptorForEntry(entry: ShelfEntry): ThumbnailDescriptor {
  return {
    id: entry.id,
    contentHash: entry.contentHash,
    coverMime: entry.coverMime,
    thumbnailMime: entry.thumbnailMime,
  };
}

/** The browser/old-store compatibility bridge used until App wires a native provider. */
export const legacyThumbnailProvider: ThumbnailProvider = {
  async readCachedThumbnail() {
    return null;
  },
  // The old ShelfStore has one cover read operation. Treat it as the source
  // fallback as well, while retaining the same provider boundary.
  async readSourceCover(descriptor) {
    const bytes = await getShelfStore().readCover(descriptor.id);
    return bytes && bytes.byteLength > 0
      ? { bytes, mime: descriptor.coverMime || "image/jpeg" }
      : null;
  },
  async writeDerivedThumbnail() {
    // The old IndexedDB schema has no derived-thumbnail store. Native/cache
    // providers implement this method; the compatibility bridge is a no-op.
  },
};

export class ThumbnailTaskQueue {
  readonly concurrency: number;
  private active = 0;
  private pending: Array<{
    task: (signal: AbortSignal) => Promise<unknown>;
    signal: AbortSignal;
    resolve(value: unknown): void;
    reject(reason?: unknown): void;
    onAbort: () => void;
  }> = [];

  constructor(concurrency = 4) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("缩略图队列并发数必须是正整数");
    }
    this.concurrency = concurrency;
  }

  get activeCount(): number {
    return this.active;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  enqueue<T>(
    task: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal = new AbortController().signal
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
      const item = {
        task: task as (signal: AbortSignal) => Promise<unknown>,
        signal,
        resolve: resolve as (value: unknown) => void,
        reject,
        onAbort: (): void => {
          const index = this.pending.indexOf(item);
          if (index < 0) return;
          this.pending.splice(index, 1);
          item.reject(abortError());
          this.drain();
        },
      };
      signal.addEventListener("abort", item.onAbort, { once: true });
      this.pending.push(item);
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const item = this.pending.shift();
      if (!item) return;
      if (item.signal.aborted) {
        item.reject(abortError());
        continue;
      }
      this.active += 1;
      item.signal.removeEventListener("abort", item.onAbort);
      void Promise.resolve()
        .then(() => item.task(item.signal))
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}

export const thumbnailTaskQueue = new ThumbnailTaskQueue(4);

export function abortError(): Error {
  return new DOMException("缩略图读取已取消", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export interface ThumbnailSize {
  width: number;
  height: number;
}

/** Scale down without cropping, bounded by the 240×360 cache contract. */
export function thumbnailSize(
  width: number,
  height: number,
  maxWidth = 240,
  maxHeight = 360
): ThumbnailSize | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function thumbnailMimeFor(sourceMime: string): "image/webp" | "image/jpeg" {
  return sourceMime.toLowerCase() === "image/jpeg" ? "image/jpeg" : "image/webp";
}

function blobFromAsset(asset: ThumbnailAsset): Blob {
  return new Blob([asset.bytes.slice().buffer as ArrayBuffer], {
    type: asset.mime || "application/octet-stream",
  });
}

function canvasBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, 0.86));
}

async function decodeWithImage(
  url: string
): Promise<{ image: HTMLImageElement; width: number; height: number } | null> {
  if (typeof Image === "undefined") return null;
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    if (typeof image.decode === "function") await image.decode();
    else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("封面解码失败"));
      });
    }
  } catch {
    return null;
  }
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  return { image, width, height };
}

/** Decode and derive a bounded image, returning null for unsupported/invalid covers. */
export async function deriveThumbnail(
  source: ThumbnailAsset,
  maxWidth = 240,
  maxHeight = 360
): Promise<ThumbnailAsset | null> {
  // SVG is intentionally decoded only through an image Blob URL. The browser
  // image decoder treats it as an image resource (scripts are not executed as
  // document content), and the pixels are immediately copied into our bounded
  // canvas; no SVG text or source URL escapes this function.
  if (!source.bytes.byteLength) return null;
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const sourceBlob = blobFromAsset(source);
  const sourceUrl = URL.createObjectURL(sourceBlob);
  let bitmap: ImageBitmap | null = null;
  try {
    let image: CanvasImageSource | null = null;
    let width = 0;
    let height = 0;
    const factory = globalThis.createImageBitmap;
    if (typeof factory === "function") {
      try {
        bitmap = await factory(sourceBlob);
        image = bitmap;
        width = bitmap.width;
        height = bitmap.height;
      } catch {
        bitmap = null;
      }
    }
    if (!image) {
      const decoded = await decodeWithImage(sourceUrl);
      if (!decoded) return null;
      image = decoded.image;
      width = decoded.width;
      height = decoded.height;
    }
    const size = thumbnailSize(width, height, maxWidth, maxHeight);
    if (!size) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, size.width, size.height);

    const preferred = thumbnailMimeFor(source.mime);
    let output = await canvasBlob(canvas, preferred);
    if (!output || output.type !== preferred) {
      output = await canvasBlob(canvas, "image/jpeg");
    }
    if (!output || (output.type !== "image/webp" && output.type !== "image/jpeg")) return null;
    return { bytes: new Uint8Array(await output.arrayBuffer()), mime: output.type };
  } catch {
    return null;
  } finally {
    bitmap?.close();
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function loadThumbnailAsset(
  provider: ThumbnailProvider,
  descriptor: ThumbnailDescriptor,
  signal: AbortSignal
): Promise<ThumbnailAsset | null> {
  if (signal.aborted) throw abortError();
  const cached = await provider.readCachedThumbnail(descriptor);
  if (signal.aborted) throw abortError();
  if (cached?.bytes.byteLength) return cached;
  const source = await provider.readSourceCover(descriptor);
  if (signal.aborted) throw abortError();
  if (!source?.bytes.byteLength) return null;
  const derived = await deriveThumbnail(source);
  if (signal.aborted) throw abortError();
  if (!derived) return null;
  try {
    await provider.writeDerivedThumbnail(descriptor, derived);
  } catch {
    // A cache write failure must not hide a usable derived cover.
  }
  return derived;
}
