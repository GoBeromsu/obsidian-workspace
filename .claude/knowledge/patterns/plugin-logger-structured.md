---
type: pattern
date: 2026-03-20
plugin: all
tags: [logging, debug, structured]
confidence: high
---

# Structured [PREFIX] level | message logger pattern

## Context
Obsidian plugins need runtime logging for debugging but `console.log` is banned by ESLint in source code. A structured logger provides consistent, filterable output while satisfying lint rules.

## Discovery
A lightweight logger class that prefixes all output with the plugin name and log level makes it easy to filter in DevTools and can be disabled in production.

## Solution

```typescript
// src/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  constructor(
    private prefix: string,
    private minLevel: LogLevel = 'info',
  ) {}

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
```

Usage:

```typescript
const logger = new Logger('SmartConnections', 'debug');
logger.info('Loaded', { version: '3.0.0' });
// → [SmartConnections] info | Loaded { version: '3.0.0' }
```

Filter in DevTools console: type `[SmartConnections]` to see only this plugin's output.

## References
- ESLint `no-console` rule: scoped disable with inline comment on the single output line
