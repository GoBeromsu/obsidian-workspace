---
type: gotcha
date: 2026-03-20
plugin: all
tags: [setIcon, dom, lifecycle]
confidence: high
---

# setIcon() replaces all children of the element

## Context
Building custom UI components that combine an icon with text content inside the same element.

## Discovery
Obsidian's `setIcon(el, iconName)` function clears all existing children of the target element before inserting the SVG icon. This means any existing children (text nodes, other elements) are destroyed when `setIcon` is called.

## Solution
Never call `setIcon` on an element that already has content you want to keep. Instead, create a dedicated child element for the icon:

```typescript
// WRONG — text will be destroyed
const btn = containerEl.createEl('button', { text: 'Search' });
setIcon(btn, 'search'); // 'Search' text is gone

// CORRECT — icon and text in separate children
const btn = containerEl.createEl('button');
const iconSpan = btn.createEl('span');
setIcon(iconSpan, 'search');
btn.createEl('span', { text: 'Search' });
```

## References
- Obsidian API: `obsidian.setIcon(element, iconId)`
