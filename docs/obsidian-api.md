# Obsidian API

> Obsidian API quirks, edge cases, and deprecated patterns. This file will grow as more API behaviors are discovered.

## Overview

1 quirk documented. When you discover a new API edge case, add it here with: API method, unexpected behavior, workaround with code example.

Find Obsidian API usage across plugins:

```bash
rg "import.*from 'obsidian'" */src/ui/
```

| Quirk | API Method | Plugins |
|-------|-----------|---------|
| [Fragment Move Semantics](#noticesetmessage-with-documentfragment) | `Notice.setMessage()` | all |

---

## Notice.setMessage() with DocumentFragment

**Plugins**: all | **Confidence**: medium

`Notice.setMessage()` accepts either a string or a `DocumentFragment`. Key behaviors:

1. The fragment is **moved** (not cloned) into the notice DOM, so the original fragment becomes empty after the call
2. If you need to update the same notice multiple times, you must create a new `DocumentFragment` each time
3. `Notice.setMessage(string)` internally sets `textContent`, which strips any existing HTML structure

**Fix**: For dynamic notices that update over time, hold a reference to the Notice and create fresh fragments on each update:

```typescript
const notice = new Notice('', 0); // duration=0 means persistent

function updateProgress(current: number, total: number): void {
  const frag = document.createDocumentFragment();
  frag.createEl('strong', { text: `Progress: ${current}/${total}` });
  const bar = frag.createEl('div');
  bar.style.width = `${(current / total) * 100}%`;
  bar.style.height = '4px';
  bar.style.background = 'var(--interactive-accent)';
  notice.setMessage(frag);
}

// When done
notice.hide();
```

---

## See Also

- [Architecture](architecture.md) — Layer structure, dependency rules
- [Exploration Guide](exploration-guide.md) — Study paths, grep patterns, feature→file mapping
- [Rules](rules.md) — Code enforcement (SRP, LOC limits, no catch-alls)
- [Patterns](patterns.md) — Proven implementation patterns
- [Gotchas](gotchas.md) — Known pitfalls and edge cases
- [Collaboration](collaboration.md) — Agent roles and handoff protocol
