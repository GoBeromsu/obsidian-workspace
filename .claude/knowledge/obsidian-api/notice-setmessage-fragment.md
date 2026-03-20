---
type: api-quirk
date: 2026-03-20
plugin: all
tags: [notice, setMessage, documentFragment, dom]
confidence: medium
---

# Notice.setMessage with DocumentFragment edge case

## Context
Updating a Notice's content dynamically, e.g., for progress indicators or multi-line messages.

## Discovery
`Notice.setMessage()` accepts either a string or a `DocumentFragment`. When passing a `DocumentFragment`, the notice's inner container is cleared and the fragment is appended. However:

1. The fragment is **moved** (not cloned) into the notice DOM, so the original fragment becomes empty after the call.
2. If you need to update the same notice multiple times, you must create a new `DocumentFragment` each time.
3. `Notice.setMessage(string)` internally sets `textContent`, which strips any existing HTML structure.

## Solution
For dynamic notices that update over time, hold a reference to the Notice and create fresh fragments on each update:

```typescript
const notice = new Notice('', 0); // duration=0 means persistent

function updateProgress(current: number, total: number): void {
  const frag = document.createDocumentFragment();
  const strong = frag.createEl('strong', { text: `Progress: ${current}/${total}` });
  const bar = frag.createEl('div');
  bar.style.width = `${(current / total) * 100}%`;
  bar.style.height = '4px';
  bar.style.background = 'var(--interactive-accent)';
  notice.setMessage(frag);
}

// When done, hide the notice
notice.hide();
```

## References
- Obsidian API: `Notice.setMessage(message: string | DocumentFragment)`
