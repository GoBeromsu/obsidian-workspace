---
type: pattern
date: 2026-03-20
plugin: obsidian-qmd, open-connections
tags: [dependency-injection, testing, adapter]
confidence: high
---

# Adapter Injection — Testable I/O via Constructor Parameters

## What it solves

Obsidian plugins often need to call external processes, APIs, or file systems. Direct coupling makes unit testing impossible without mocking Node.js internals. Adapter injection passes the I/O function as a constructor parameter, making it trivially replaceable in tests.

## When to use

- External process calls (child_process)
- Network requests (requestUrl, fetch)
- File system operations beyond vault adapter
- Any I/O that should be tested without real side effects

## When NOT to use

- Vault operations via `app.vault` — use Obsidian's API directly in `ui/` layer
- Simple config reads — no need for injection overhead

## Code example

```typescript
// Define the I/O function type
type ExecFileAsync = (
  file: string,
  args: string[],
  options: { encoding: 'utf8'; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

// Default: real implementation
import { promisify } from 'util';
import { execFile } from 'child_process';
const defaultExecFile = promisify(execFile) as ExecFileAsync;

// Class accepts injected implementation
export class QmdProcessAdapter {
  constructor(
    private path: string,
    private readonly execFileAsync: ExecFileAsync = defaultExecFile,
  ) {}
}

// Test: inject mock — no real process spawning
const mockExec: ExecFileAsync = async () => ({
  stdout: '{"results": []}', stderr: '',
});
const adapter = new QmdProcessAdapter('qmd', mockExec);
```

## Which plugins use it

- **obsidian-qmd**: `QmdProcessAdapter` injects `execFileAsync` for child process calls
- **open-connections**: Embedding model adapters use `requestUrl` from obsidian
