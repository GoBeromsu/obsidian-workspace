import { describe, expect, test } from "bun:test";
import type { SchedulerClock } from "../src/types/view";
import { INITIAL_FRESHNESS, freshnessSummary, reduceFreshness } from "../src/domain/freshness-reducer";
import { RefreshScheduler } from "../src/ui/refresh-scheduler";

/** Fake clock so polling behavior is asserted without real time. */
function fakeClock(): { clock: SchedulerClock; fire: () => void } {
  let nextHandle = 1;
  const handlers = new Map<number, () => void>();
  return {
    clock: {
      setInterval: (handler) => {
        const handle = nextHandle++;
        handlers.set(handle, handler);
        return handle;
      },
      clearInterval: (handle) => {
        handlers.delete(handle);
      },
    },
    fire: () => {
      for (const handler of [...handlers.values()]) handler();
    },
  };
}

describe("freshness reducer", () => {
  test("failure keeps the last content and timestamp, success clears stale", () => {
    const read = reduceFreshness(INITIAL_FRESHNESS, {
      kind: "success",
      at: "2026-09-12T12:00:00Z",
      sourceStatus: "read",
      detail: null,
    });
    expect(read.stale).toBe(false);

    const failed = reduceFreshness(read, { kind: "failure", transport: "timeout", detail: "timed out" });
    expect(failed.stale).toBe(true);
    expect(failed.lastUpdatedAt).toBe("2026-09-12T12:00:00Z");
    expect(failed.sourceStatus).toBe("read");
    expect(freshnessSummary(failed)).toContain("showing content from");

    const recovered = reduceFreshness(failed, {
      kind: "success",
      at: "2026-09-12T12:01:00Z",
      sourceStatus: "read",
      detail: null,
    });
    expect(recovered.stale).toBe(false);
    expect(recovered.lastUpdatedAt).toBe("2026-09-12T12:01:00Z");
  });

  test("each source keeps independent state", () => {
    const healthy = reduceFreshness(INITIAL_FRESHNESS, {
      kind: "success", at: "t1", sourceStatus: "read", detail: null,
    });
    const broken = reduceFreshness(INITIAL_FRESHNESS, {
      kind: "failure", transport: "auth-failed", detail: "denied",
    });
    expect(healthy.stale).toBe(false);
    expect(broken.stale).toBe(true);
  });
});

describe("refresh scheduler", () => {
  test("polls only while a view is open and stops on the last close", () => {
    const { clock } = fakeClock();
    const scheduler = new RefreshScheduler(async () => {}, 60_000, clock);

    expect(scheduler.isPolling).toBe(false);
    scheduler.viewOpened();
    expect(scheduler.isPolling).toBe(true);
    scheduler.viewOpened();
    scheduler.viewClosed();
    // One view is still open, so polling must continue.
    expect(scheduler.isPolling).toBe(true);
    scheduler.viewClosed();
    expect(scheduler.isPolling).toBe(false);
  });

  test("merges triggers that arrive during a slow round into one follow-up", async () => {
    const { clock, fire } = fakeClock();
    let runs = 0;
    const releases: (() => void)[] = [];
    const scheduler = new RefreshScheduler(
      () => {
        runs += 1;
        return new Promise<void>((resolve) => {
          releases.push(resolve);
        });
      },
      60_000,
      clock,
    );

    scheduler.viewOpened();
    fire();
    await Promise.resolve();
    expect(runs).toBe(1);

    // Three more triggers while the first round is still in flight.
    fire();
    scheduler.trigger();
    fire();
    expect(runs).toBe(1);

    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runs).toBe(2);

    // Draining the merged follow-up must not spawn a third round.
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runs).toBe(2);
  });

  test("interval changes restart an active timer only", () => {
    const { clock } = fakeClock();
    const scheduler = new RefreshScheduler(async () => {}, 60_000, clock);
    scheduler.setInterval(30_000);
    expect(scheduler.isPolling).toBe(false);
    scheduler.viewOpened();
    scheduler.setInterval(15_000);
    expect(scheduler.isPolling).toBe(true);
    scheduler.stop();
    expect(scheduler.isPolling).toBe(false);
  });
});
