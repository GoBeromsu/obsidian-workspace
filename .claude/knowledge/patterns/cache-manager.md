---
type: pattern
date: 2026-03-20
plugin: obsidian-eagle-plugin, obsidian-qmd
tags: [cache, hash, performance]
confidence: high
---

# Cache Manager — Hash-based Cache with LRU Eviction

## What it solves

Expensive operations (image processing, search queries) need caching to avoid redundant work. A hash-based cache uses content hashing to detect changes and LRU eviction to bound memory.

## When to use

- Image upload deduplication (Eagle: skip re-upload if hash matches)
- Search result caching (QMD: cache related notes per file+mtime)
- Any operation where input can be hashed to detect staleness

## When NOT to use

- Tiny operations where caching overhead > computation cost
- Data that changes on every access (e.g., timestamps)

## Code example

```typescript
const CACHE_MAX_SIZE = 20;
const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class LruCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
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

## Which plugins use it

- **obsidian-eagle-plugin**: `EagleHashStore` — content hash for image deduplication
- **obsidian-qmd**: `QmdRelatedView` — file path + mtime cache for related notes
