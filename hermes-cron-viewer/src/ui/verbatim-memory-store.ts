import type { VerbatimEntry } from "../types/snapshot";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * In-memory store for verbatim bodies (prompts, replies, error text, output files).
 *
 * Nothing here is ever written to disk or to the log. After an Obsidian restart the store is empty
 * by construction, so an offline source reports "not held" instead of showing a stale body.
 */
export class VerbatimMemoryStore {
  private readonly entries = new Map<string, VerbatimEntry>();
  private totalBytes = 0;

  constructor(private readonly maxBytes: number = DEFAULT_MAX_BYTES) {}

  get(key: string): VerbatimEntry | undefined {
    return this.entries.get(key);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  set(key: string, body: string, capExceeded: boolean): VerbatimEntry {
    const bytes = new TextEncoder().encode(body).byteLength;
    const existing = this.entries.get(key);
    if (existing !== undefined) this.totalBytes -= existing.bytes;

    const entry: VerbatimEntry = { key, body, capExceeded, bytes };
    this.entries.set(key, entry);
    this.totalBytes += bytes;
    this.evictOldest();
    return entry;
  }

  /** Drop least-recently inserted entries until the budget holds. */
  private evictOldest(): void {
    for (const [key, entry] of this.entries) {
      if (this.totalBytes <= this.maxBytes) return;
      this.entries.delete(key);
      this.totalBytes -= entry.bytes;
    }
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }

  get sizeBytes(): number {
    return this.totalBytes;
  }
}
