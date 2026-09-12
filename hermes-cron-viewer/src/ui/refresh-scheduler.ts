import type { SchedulerClock } from "../types/view";

const systemClock: SchedulerClock = {
  setInterval: (handler, ms) => globalThis.setInterval(handler, ms) as unknown as number,
  clearInterval: (handle) => globalThis.clearInterval(handle),
};

/**
 * Polls while at least one view is open.
 *
 * View lifecycle drives the timer: the first open view starts it and the last one closing stops
 * it, so a closed viewer issues no remote commands. Triggers that arrive during a run are merged
 * into at most one follow-up round instead of queueing without bound.
 */
export class RefreshScheduler {
  private handle: number | null = null;
  private openViews = 0;
  private running = false;
  private pending = false;

  constructor(
    private readonly run: () => Promise<void>,
    private intervalMs: number,
    private readonly clock: SchedulerClock = systemClock,
  ) {}

  viewOpened(): void {
    this.openViews += 1;
    if (this.openViews === 1) this.start();
  }

  viewClosed(): void {
    this.openViews = Math.max(0, this.openViews - 1);
    if (this.openViews === 0) this.stop();
  }

  get isPolling(): boolean {
    return this.handle !== null;
  }

  get openViewCount(): number {
    return this.openViews;
  }

  setInterval(intervalMs: number): void {
    this.intervalMs = intervalMs;
    if (this.handle !== null) {
      this.stop();
      this.start();
    }
  }

  /** Manual refresh. Merges with an in-flight round rather than running a second one. */
  trigger(): void {
    void this.tick();
  }

  private start(): void {
    if (this.handle !== null) return;
    this.handle = this.clock.setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.handle === null) return;
    this.clock.clearInterval(this.handle);
    this.handle = null;
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    try {
      await this.run();
    } finally {
      this.running = false;
      if (this.pending) {
        this.pending = false;
        await this.tick();
      }
    }
  }
}
