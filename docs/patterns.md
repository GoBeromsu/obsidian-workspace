# Patterns

> Proven code patterns used across the Obsidian plugin submodule workspace. Each pattern includes when to use it, when not to, and a code example.

## Overview

8 patterns documented. Format: problem, solution, code example, grep command to find all uses.

| Pattern | Plugins | Confidence |
|---------|---------|------------|
| [Catalog-driven Notice System](#catalog-driven-notice-system) | all | high |
| [Structured Logger](#structured-logger) | all | high |
| [No Update-Available Notices](#no-update-available-notices-anti-pattern) | all | high |
| [Debounce Controller](#debounce-controller) | qmd, sc | high |
| [Adapter Injection](#adapter-injection) | qmd, sc | high |
| [State Machine Reducer](#state-machine-reducer) | sc | high |
| [Cache Manager](#cache-manager) | eagle, qmd | high |
| [Process Adapter](#process-adapter) | qmd | high |

---

## Catalog-driven Notice System

**Plugins**: all | **Confidence**: high

Obsidian plugins often scatter `new Notice('...')` calls throughout the codebase, making it hard to maintain consistent messaging, support i18n, or audit user-facing strings. A catalog-driven approach centralizes all notice definitions in one typed const object.

```typescript
// src/notices.ts
export const NOTICES = {
  EMBED_START: {
    message: (count: number) => `Embedding ${count} items...`,
    duration: 4000,
  },
  API_KEY_MISSING: {
    message: () => 'API key is not configured. Check settings.',
    duration: 5000,
  },
} as const;

// Typed helper
type NoticeKey = keyof typeof NOTICES;
export function showNotice<K extends NoticeKey>(
  key: K,
  ...args: Parameters<(typeof NOTICES)[K]['message']>
): void {
  const entry = NOTICES[key];
  new Notice(entry.message(...args), entry.duration);
}

// Usage
showNotice('EMBED_START', 150);
```

Find all uses: `rg "showNotice\|NOTICES" */src/`

---

## Structured Logger

**Plugins**: all | **Confidence**: high

A lightweight logger class that prefixes all output with the plugin name and log level. Makes it easy to filter in DevTools and satisfies the `no-console` ESLint rule (single `eslint-disable` on the output line).

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export class Logger {
  constructor(private prefix: string, private minLevel: LogLevel = 'info') {}

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;
    const method = level === 'debug' ? 'log' : level;
    // eslint-disable-next-line no-console
    console[method](`[${this.prefix}] ${level} | ${message}`, ...args);
  }

  debug(msg: string, ...args: unknown[]) { this.log('debug', msg, ...args); }
  info(msg: string, ...args: unknown[]) { this.log('info', msg, ...args); }
  warn(msg: string, ...args: unknown[]) { this.log('warn', msg, ...args); }
  error(msg: string, ...args: unknown[]) { this.log('error', msg, ...args); }
}

// Usage: const logger = new Logger('SmartConnections', 'debug');
// Filter in DevTools: type "[SmartConnections]"
```

Find all uses: `rg "new Logger\|logger\." */src/`

---

## No Update-Available Notices (Anti-pattern)

**Plugins**: all | **Confidence**: high

**Never show unsolicited update notices.** Interrupting user focus with "Update available (vX.Y.Z)" popups is bad UX. Users are deep in writing/thinking when the notice pops up.

- Remove all update-check polling (`setTimeout`/`setInterval`)
- Remove `update_available` from notice catalog
- Users get updates via BRAT or manual check in settings
- No plugin should show unsolicited update notices — this is a boiler-template rule

Check for violations: `rg "checkForUpdate\|update_available\|updateNotice" */src/`

---

## Debounce Controller

**Plugins**: obsidian-qmd, open-connections | **Confidence**: high

Standard debounce drops intermediate calls. When long-running async operations (like file sync or embedding) are interrupted by new events, those events get lost. `DebounceController` ensures a rerun happens after the current execution completes if `markDirty()` was called during execution.

**Use for**: Auto-sync triggered by file changes, batch processing triggered by user edits, any async operation that should coalesce rapid triggers but never lose the last one.

**Don't use for**: Simple UI debounce (use `setTimeout`), fire-and-forget operations, synchronous operations.

```typescript
export class DebounceController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private rerun = false;

  constructor(private readonly options: { delayMs: number; onRun: () => Promise<void> }) {}

  markDirty(): void {
    if (this.running) { this.rerun = true; return; }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.run(); }, this.options.delayMs);
  }

  dispose(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  private async run(): Promise<void> {
    this.running = true; this.rerun = false;
    try { await this.options.onRun(); }
    finally {
      this.running = false;
      if (this.rerun) { this.rerun = false; this.markDirty(); }
    }
  }
}
```

Find all uses: `rg "DebounceController" */src/`

---

## Adapter Injection

**Plugins**: obsidian-qmd, open-connections | **Confidence**: high

Pass I/O functions as constructor parameters to make code testable without mocking Node.js internals.

**Use for**: External process calls, network requests, file system operations beyond vault adapter.

**Don't use for**: Vault operations via `app.vault` (use Obsidian API in `ui/`), simple config reads.

```typescript
type ExecFileAsync = (
  file: string, args: string[],
  options: { encoding: 'utf8'; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

export class QmdProcessAdapter {
  constructor(
    private path: string,
    private readonly execFileAsync: ExecFileAsync = defaultExecFile,
  ) {}
}

// Test: inject mock
const mockExec: ExecFileAsync = async () => ({ stdout: '{"results": []}', stderr: '' });
const adapter = new QmdProcessAdapter('qmd', mockExec);
```

Find all uses: `rg "ExecFileAsync\|execFileAsync" */src/`

---

## State Machine Reducer

**Plugins**: open-connections | **Confidence**: high

Complex async workflows need predictable state transitions. A pure reducer `(prevState, event) => nextState` with no side effects is fully testable. The store holds state and dispatches events.

**Use for**: Multi-phase async workflows with progress tracking, complex state transitions, time-travel debugging.

**Don't use for**: Simple on/off toggles, CRUD without complex transitions, small plugins with 1-2 states.

```typescript
// domain/kernel/reducer.ts — PURE (no side effects)
export function embedReducer(state: EmbedState, event: EmbedEvent): EmbedState {
  switch (event.type) {
    case 'START': return { phase: 'embedding', progress: 0 };
    case 'PROGRESS': return { ...state, progress: event.value };
    case 'COMPLETE': return { phase: 'complete', progress: 100 };
    case 'ERROR': return { phase: 'error', progress: state.progress, error: event.message };
    default: return state;
  }
}

// ui/kernel/store.ts — Stateful (ui/ layer since it has side effects)
export class EmbedStore {
  private state: EmbedState = { phase: 'idle', progress: 0 };
  dispatch(event: EmbedEvent): void {
    this.state = embedReducer(this.state, event);
    this.listeners.forEach(fn => fn(this.state));
  }
}
```

Find all uses: `rg "Reducer\|reducer\|dispatch" */src/domain/`

---

## Cache Manager

**Plugins**: obsidian-eagle-plugin, obsidian-qmd | **Confidence**: high

Hash-based cache with LRU eviction for expensive operations.

**Use for**: Image upload deduplication, search result caching, any operation where input can be hashed to detect staleness.

**Don't use for**: Tiny operations where caching overhead > computation cost, data that changes on every access.

```typescript
const CACHE_MAX_SIZE = 20;
const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> { data: T; timestamp: number; }

class LruCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) { this.cache.delete(key); return null; }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
    if (this.cache.size > CACHE_MAX_SIZE) {
      const oldest = [...this.cache.entries()]
        .reduce((a, b) => a[1].timestamp < b[1].timestamp ? a : b);
      this.cache.delete(oldest[0]);
    }
  }
}
```

Find all uses: `rg "LruCache\|CacheEntry\|HashStore" */src/`

---

## Process Adapter

**Plugins**: obsidian-qmd | **Confidence**: high

Encapsulates all child process interaction for external CLI integration: binary resolution (PATH, homebrew, nvm, bun), Node runtime detection, output parsing via pure functions, error normalization.

**Use for**: Integrating with external CLI tools, non-standard binary locations, CLI output parsing.

**Don't use for**: HTTP API integrations (use `requestUrl`), simple shell commands.

```typescript
// ui/qmd-process-adapter.ts — I/O layer
export class QmdProcessAdapter {
  constructor(
    private executablePath: string,
    private readonly execFileAsync: ExecFileAsync = defaultExecFile,
  ) {}

  async listCollections(): Promise<string[]> {
    const { stdout } = await this.run(['collection', 'list']);
    return parseCollectionList(stdout); // delegates to pure parser in utils/
  }
}

// utils/parser.ts — Pure layer (zero I/O)
export function parseCollectionList(stdout: string): string[] {
  // Pure regex parsing, no side effects
}
```

Expected file structure:

```
src/
├── ui/
│   └── qmd-process-adapter.ts   # I/O layer — spawns process
└── utils/
    └── parser.ts                 # Pure layer — parses output
```

Find all uses: `rg "ProcessAdapter\|resolveExecutablePath" */src/`

---

## See Also

- [Architecture](architecture.md) — Layer structure, dependency rules
- [Exploration Guide](exploration-guide.md) — Study paths, grep patterns, feature→file mapping
- [Rules](rules.md) — Code enforcement (SRP, LOC limits, no catch-alls)
- [Gotchas](gotchas.md) — Known pitfalls and edge cases
- [Obsidian API](obsidian-api.md) — API quirks and workarounds
- [Collaboration](collaboration.md) — Agent roles and handoff protocol
