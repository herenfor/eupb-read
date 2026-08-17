import type { ShelfProgressPatch } from "./shelf";

type WriteProgress = (id: string, patch: ShelfProgressPatch) => Promise<void>;

/**
 * 单通道、同书最新值优先的进度写入器。
 * 写入进行中时的连续翻页只保留最后一个待写位置，避免旧请求晚到覆盖新位置。
 */
export class ShelfProgressWriter {
  private readonly pending = new Map<string, ShelfProgressPatch>();
  private draining: Promise<void> | null = null;
  private readonly failed = new Map<
    string,
    { patch: ShelfProgressPatch; error: unknown }
  >();

  constructor(private readonly write: WriteProgress) {}

  enqueue(id: string, patch: ShelfProgressPatch): void {
    this.pending.set(id, patch);
    this.startDrain();
  }

  async flush(): Promise<void> {
    while (this.draining) await this.draining;
    if (this.failed.size === 0) return;
    // 返回书架/关闭窗口时对失败的最终位置再尝试一次；仍失败才交给 UI。
    const retries = Array.from(this.failed.entries());
    this.failed.clear();
    for (const [id, value] of retries) this.pending.set(id, value.patch);
    this.startDrain();
    while (this.draining) await this.draining;
    if (this.failed.size === 0) return;
    const error = Array.from(this.failed.values()).at(-1)?.error;
    throw error ?? new Error("阅读进度写入失败");
  }

  private startDrain(): void {
    if (this.draining) return;
    this.draining = this.drain().finally(() => {
      this.draining = null;
      if (this.pending.size > 0) this.startDrain();
    });
  }

  private async drain(): Promise<void> {
    while (this.pending.size > 0) {
      const first = this.pending.entries().next().value as
        | [string, ShelfProgressPatch]
        | undefined;
      if (!first) return;
      const [id, patch] = first;
      this.pending.delete(id);
      try {
        await this.write(id, patch);
        this.failed.delete(id);
      } catch (error) {
        this.failed.set(id, { patch, error });
      }
    }
  }
}
