export const FOOTNOTE_HOVER_CLOSE_GRACE_MS = 140;

export interface FootnoteHoverScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

const browserScheduler: FootnoteHoverScheduler = {
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: (handle) => window.clearTimeout(handle as number),
};

/**
 * Keeps an iframe footnote marker and its host overlay in one hover domain.
 * The gate owns only timing/state; rendering and close side effects stay with
 * the caller so it can be exercised without a DOM or React.
 */
export class FootnoteHoverGate {
  private markerHover = false;
  private overlayHover = false;
  private pinned = false;
  private visible = false;
  private timer: unknown = null;
  private disposed = false;

  constructor(
    private readonly onClose: () => void,
    private readonly scheduler: FootnoteHoverScheduler = browserScheduler,
  ) {}

  show(pinned: boolean): void {
    if (this.disposed) return;
    this.visible = true;
    this.pinned = pinned;
    this.cancelClose();
  }

  isVisible(): boolean {
    return this.visible;
  }

  markerEnter(): void {
    if (this.disposed) return;
    this.markerHover = true;
    this.cancelClose();
  }

  markerLeave(): void {
    if (this.disposed) return;
    this.markerHover = false;
    this.scheduleClose();
  }

  overlayEnter(): void {
    if (this.disposed) return;
    this.overlayHover = true;
    this.cancelClose();
  }

  overlayLeave(): void {
    if (this.disposed) return;
    this.overlayHover = false;
    this.scheduleClose();
  }

  setPinned(pinned: boolean): void {
    if (this.disposed) return;
    this.pinned = pinned;
    if (pinned) this.cancelClose();
    else this.scheduleClose();
  }

  reset(): void {
    this.cancelClose();
    this.markerHover = false;
    this.overlayHover = false;
    this.pinned = false;
    this.visible = false;
  }

  dispose(): void {
    this.reset();
    this.disposed = true;
  }

  private scheduleClose(): void {
    if (!this.visible || this.pinned || this.markerHover || this.overlayHover || this.timer !== null) return;
    this.timer = this.scheduler.schedule(() => {
      this.timer = null;
      if (!this.visible || this.pinned || this.markerHover || this.overlayHover) return;
      this.visible = false;
      this.onClose();
    }, FOOTNOTE_HOVER_CLOSE_GRACE_MS);
  }

  private cancelClose(): void {
    if (this.timer === null) return;
    this.scheduler.cancel(this.timer);
    this.timer = null;
  }
}
