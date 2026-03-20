---
type: pattern
date: 2026-03-20
plugin: obsidian-qmd
tags: [adapter, external-process, cli]
confidence: high
---

# Process Adapter — External CLI Integration

## What it solves

Obsidian plugins sometimes need to call external CLI tools (like QMD). The process adapter pattern encapsulates all child process interaction behind a class that handles:
- Binary resolution (PATH, homebrew, nvm, bun)
- Node runtime detection for JS-based CLIs
- Output parsing via pure functions
- Error normalization

## When to use

- Integrating with external CLI tools from Obsidian
- When the external binary may be installed in non-standard locations
- When the CLI output needs parsing into typed domain objects

## When NOT to use

- HTTP API integrations (use requestUrl instead)
- Simple shell commands (just use child_process directly)

## Code example

```typescript
// ui/qmd-process-adapter.ts — I/O layer (can import child_process)
export class QmdProcessAdapter {
  constructor(
    private executablePath: string,
    private readonly execFileAsync: ExecFileAsync = defaultExecFile,
  ) {}

  async listCollections(): Promise<string[]> {
    const { stdout } = await this.run(['collection', 'list']);
    return parseCollectionList(stdout); // delegates to pure parser in utils/
  }

  private async run(args: string[]): Promise<{ stdout: string }> {
    const executable = await this.resolveExecutablePath();
    return this.execFileAsync(executable, args, { encoding: 'utf8', maxBuffer: 10_000_000 });
  }

  private async resolveExecutablePath(): Promise<string> {
    // Try login shell, homebrew, nvm, bun, global npm...
  }
}

// utils/parser.ts — Pure layer (zero I/O)
export function parseCollectionList(stdout: string): string[] {
  // Pure regex parsing, no side effects
}
```

## Which plugins use it

- **obsidian-qmd**: `QmdProcessAdapter` for qmd CLI integration
