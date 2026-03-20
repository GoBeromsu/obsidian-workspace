---
type: pattern
date: 2026-03-20
plugin: all
tags: [notice, ui, catalog, i18n]
confidence: high
---

# Catalog-driven Notice system pattern

## Context
Obsidian plugins often scatter `new Notice('...')` calls throughout the codebase, making it hard to maintain consistent messaging, support i18n, or audit user-facing strings.

## Discovery
A catalog-driven approach centralizes all notice definitions in one place, typed as a const object. Each entry defines the message template, optional duration, and severity level.

## Solution

Define a notice catalog:

```typescript
// src/notices.ts
export const NOTICES = {
  EMBED_START: {
    message: (count: number) => `Embedding ${count} items...`,
    duration: 4000,
  },
  EMBED_COMPLETE: {
    message: (count: number) => `Embedded ${count} items successfully.`,
    duration: 3000,
  },
  API_KEY_MISSING: {
    message: () => 'API key is not configured. Check settings.',
    duration: 5000,
  },
} as const;
```

Create a typed helper:

```typescript
import { Notice } from 'obsidian';
import { NOTICES } from './notices';

type NoticeKey = keyof typeof NOTICES;

export function showNotice<K extends NoticeKey>(
  key: K,
  ...args: Parameters<(typeof NOTICES)[K]['message']>
): void {
  const entry = NOTICES[key];
  new Notice(entry.message(...args), entry.duration);
}
```

Usage:

```typescript
showNotice('EMBED_START', 150);
showNotice('API_KEY_MISSING');
```

Benefits: single source of truth for all user-facing messages, easy to audit, easy to add i18n later.

## References
- Obsidian API: `new Notice(message, timeout?)`
