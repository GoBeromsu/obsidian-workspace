---
type: pattern
date: 2026-03-20
plugin: obsidian-qmd, obsidian-smart-connections
tags: [debounce, async, state-management]
confidence: high
---

# DebounceController — Debounce with Rerun Semantics

## What it solves

Standard debounce drops intermediate calls. When long-running async operations (like file sync or embedding) are interrupted by new events, those events get lost. DebounceController ensures a rerun happens after the current execution completes if `markDirty()` was called during execution.

## When to use

- Auto-sync triggered by file changes (QMD collection sync)
- Batch processing triggered by user edits (SC embedding pipeline)
- Any async operation that should coalesce rapid triggers but never lose the last one

## When NOT to use

- Simple UI debounce (text input) — use `setTimeout` directly
- Fire-and-forget operations with no rerun need
- Synchronous operations

## Code example

```typescript
export interface DebounceControllerOptions {
  delayMs: number;
  onRun: () => Promise<void>;
}

export class DebounceController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private rerun = false;

  constructor(private readonly options: DebounceControllerOptions) {}

  markDirty(): void {
    if (this.running) {
      this.rerun = true;
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.options.delayMs);
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async run(): Promise<void> {
    this.running = true;
    this.rerun = false;
    try {
      await this.options.onRun();
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        this.markDirty();
      }
    }
  }
}
```

## Which plugins use it

- **obsidian-qmd**: Auto-sync on vault file changes (`auto-sync.ts`)
- **obsidian-smart-connections**: File watcher debounce (`file-watcher.ts`)
- **obsidian-eagle-plugin**: Not currently used (has its own simpler debounce)
- **obsidian-bible-search**: Not used
