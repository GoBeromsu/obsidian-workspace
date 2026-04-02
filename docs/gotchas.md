# Gotchas

> Things that don't work as expected. Each gotcha includes the symptom, root cause, and fix.

## Overview

7 gotchas documented. Format: symptom, root cause, fix with code example.

| Gotcha | Plugins | Severity |
|--------|---------|----------|
| [setIcon() Replaces All Children](#seticon-replaces-all-children) | all | high |
| [QMD vec/hyde Rejects Negation](#qmd-vechyde-queries-reject-negation) | qmd | high |
| [QMD Rejects ALL Hyphens](#qmd-rejects-all-hyphens-in-vechyde-not-just--word) | qmd | high |
| [ESLint no-console Must Be Scoped](#eslint-no-console-must-be-scoped) | all | high |
| [CI Uses --frozen-lockfile](#ci-uses---frozen-lockfile) | all | high |
| [sync:check Cannot Run in CI](#synccheck-cannot-run-in-github-actions) | all | high |
| [SC Re-Import Infinite Loop](#open-connections-re-import-infinite-loop) | sc | high |

---

## setIcon() Replaces All Children

**Plugins**: all | **Confidence**: high

Obsidian's `setIcon(el, iconName)` clears all existing children of the target element before inserting the SVG icon. Any existing children (text nodes, other elements) are destroyed.

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

---

## QMD vec/hyde Queries Reject Negation

**Plugins**: obsidian-qmd | **Confidence**: high

QMD's `vec` and `hyde` query types do not support the `-term` negation operator. Negation only works with `lex` (BM25 keyword) queries. If you include `-term` in a vec/hyde query, it is either ignored or causes unexpected behavior.

```
# Correct — negation only in lex
lex: error handling -deprecated
vec: how to handle errors gracefully in Obsidian plugins

# Wrong — negation broken in vec
vec: error handling -deprecated
```

---

## QMD Rejects ALL Hyphens in vec/hyde (Not Just -word)

**Plugins**: obsidian-qmd | **Confidence**: high

QMD's query parser treats ANY `-` followed by any word character (including digits) as negation in vec/hyde lines. Dates like `2026-03-13` have `-03` and `-13` which are both interpreted as negation.

**Fix**: Replace ALL hyphens with spaces in vec/hyde lines: `value.replace(/-/g, ' ')`. Safe because vec/hyde are semantic embedding queries — hyphens don't affect meaning. Lex lines can keep hyphens (lex supports negation intentionally).

**Ref**: `src/qmd/query-builder.ts` `sanitizeForVec()`

---

## ESLint no-console Must Be Scoped

**Plugins**: all | **Confidence**: high

Applying `no-console` globally causes CI failures because build scripts (`esbuild.config.mjs`, `scripts/*.mjs`) and test files legitimately use `console.log`.

```javascript
// Correct — scoped to source only
{
  files: ['src/**/*.ts'],
  rules: { 'no-console': 'error' },
}
```

Do not apply `no-console` at the top level or it will break: `esbuild.config.mjs`, `scripts/release.mjs`, `scripts/release-notes.mjs`, test files.

---

## CI Uses --frozen-lockfile

**Plugins**: all | **Confidence**: high

GitHub Actions CI runs `pnpm install --frozen-lockfile`. This flag refuses to modify `pnpm-lock.yaml` and fails the build if the lockfile is out of sync with `package.json`.

**Fix**: Always commit `pnpm-lock.yaml` alongside `package.json` changes. Ensure `.gitignore` does NOT include `pnpm-lock.yaml`.

```bash
# If lockfile is out of sync:
pnpm install
git add package.json pnpm-lock.yaml
git commit -m "chore: sync lockfile"
```

---

## sync:check Cannot Run in GitHub Actions

**Plugins**: all | **Confidence**: high

`sync:check` calls `scripts/sync-to-plugins.mjs --check` which resolves target repos relative to the boiler-template root. On GitHub Actions, each plugin runs CI independently — sibling repos don't exist.

**Fix**:
- **Remove** `sync:check` from the generated CI workflow
- **Keep** `sync:check` in local `release.mjs` (only runs where all repos are siblings)
- **Keep** `sync:check` in boiler-template's own CI (it self-syncs)
- Enforcement chain: local release pipeline catches drift before tags are pushed

**Ref**: `tooling/sync/index.mjs` `renderCiWorkflow()`

---

## Open Connections Re-Import Infinite Loop

**Plugins**: open-connections | **Confidence**: high

Plugin reload (disable -> enable) causes an infinite re-import loop. `_unloading` flag is set in `onunload()` but old timer callbacks from the previous instance survive. `runEmbeddingJobNow` rejects with "plugin is unloading" -> queue never shrinks -> `deferReImport` schedules again -> infinite loop.

**Immediate fix**: Reset `_unloading = false` in `onload()`. Guard `deferReImport` with `!plugin._unloading` check.

**Root cause**: The embedding lifecycle is too complex — multiple timer layers, FSM kernel with 21 event types, race condition between unload and async operations. QMD solves the same problem with `AutoSyncController` (simple debounce + rerun).

**Ref**: `src/app/file-watcher.ts:218-221`, `src/app/main.ts:142`, `src/features/embedding/embedding-manager.ts:626`

---

## See Also

- [Architecture](architecture.md) — Layer structure, dependency rules
- [Exploration Guide](exploration-guide.md) — Study paths, grep patterns, feature→file mapping
- [Rules](rules.md) — Code enforcement (SRP, LOC limits, no catch-alls)
- [Patterns](patterns.md) — Proven implementation patterns
- [Obsidian API](obsidian-api.md) — API quirks and workarounds
- [Collaboration](collaboration.md) — Agent roles and handoff protocol
