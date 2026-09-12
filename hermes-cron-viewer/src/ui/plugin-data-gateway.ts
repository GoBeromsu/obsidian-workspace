import type { Plugin } from "obsidian";

/**
 * Single owner for `data.json` read-modify-write cycles.
 *
 * Settings, remote homes and the snapshot store live in one file and are updated from independent
 * async paths. Without serialization two overlapping cycles both read the pre-update document and
 * the later write silently drops the earlier change, so every mutation is queued here.
 */
export class PluginDataGateway {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly plugin: Plugin) {}

  async read<T extends Record<string, unknown>>(): Promise<T> {
    return this.enqueue(async () => ((await this.plugin.loadData()) as T | null) ?? ({} as T));
  }

  /** Apply `mutate` to the current document and persist the result atomically for this process. */
  async update<T extends Record<string, unknown>>(mutate: (current: T) => T): Promise<void> {
    await this.enqueue(async () => {
      const current = ((await this.plugin.loadData()) as T | null) ?? ({} as T);
      await this.plugin.saveData(mutate(current));
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    // Keep the chain alive even when one task rejects.
    this.queue = next.catch(() => undefined);
    return next;
  }
}
