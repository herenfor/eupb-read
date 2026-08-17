import { describe, expect, it } from "vitest";
import { ShelfProgressWriter } from "./progressWriter";
import type { ShelfProgressPatch } from "./shelf";

function patch(page: number): ShelfProgressPatch {
  return {
    lastReadAtMs: page,
    spineIndex: 0,
    page,
    progressPct: page,
    anchorIndex: page,
    anchorRatio: 0.5,
  };
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ShelfProgressWriter", () => {
  it("写入中连续翻页只保留最新待写值", async () => {
    const first = deferred();
    const writes: number[] = [];
    const writer = new ShelfProgressWriter(async (_id, value) => {
      writes.push(value.page);
      if (writes.length === 1) await first.promise;
    });

    writer.enqueue("book", patch(1));
    await Promise.resolve();
    writer.enqueue("book", patch(2));
    writer.enqueue("book", patch(3));
    first.resolve();
    await writer.flush();
    expect(writes).toEqual([1, 3]);
  });

  it("不同书的最终进度不会互相覆盖", async () => {
    const writes: string[] = [];
    const writer = new ShelfProgressWriter(async (id, value) => {
      writes.push(`${id}:${value.page}`);
    });
    writer.enqueue("a", patch(2));
    writer.enqueue("b", patch(4));
    await writer.flush();
    expect(writes).toEqual(["a:2", "b:4"]);
  });

  it("flush 报告写入错误，但后续写入仍可继续", async () => {
    let fail = true;
    const writes: number[] = [];
    const writer = new ShelfProgressWriter(async (_id, value) => {
      if (fail) throw new Error("disk failed");
      writes.push(value.page);
    });
    writer.enqueue("book", patch(1));
    await expect(writer.flush()).rejects.toThrow("disk failed");
    fail = false;
    writer.enqueue("book", patch(2));
    await writer.flush();
    expect(writes).toEqual([2]);
  });
});

