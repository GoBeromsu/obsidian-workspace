# Exploration Guide

> How to navigate this monorepo, find what you need, and understand how things connect.

## Quick Start

New to this codebase? Read these docs in order:

1. **[Architecture](architecture.md)** — Understand the 4-layer structure every plugin shares
2. **[Rules](rules.md)** — Know the mandatory code rules before touching anything
3. **Pick a plugin** and read its `src/main.ts` — see how layers wire together
4. **[Patterns](patterns.md)** — Learn the proven patterns before implementing

---

## Finding Things

### "How does plugin X work?"

1. Go to `<plugin>/src/main.ts` — this is the composition root
2. Read `onload()` — all initialization, command registration, and view registration happens here
3. Trace imports: `main.ts` imports from `ui/`, which imports from `domain/`, which imports from `utils/` and `types/`
4. Settings are in `ui/settings*.ts`

### "How does embedding work?" (open-connections)

1. Start at `open-connections/src/domain/kernel/reducer.ts` — pure state transitions
2. Read `open-connections/src/domain/kernel/selectors.ts` — derived queries
3. Trace to `open-connections/src/ui/kernel/store.ts` — stateful store that dispatches events
4. File watcher triggers embedding: `open-connections/src/ui/file-watcher.ts`

### "How does QMD search work?" (obsidian-qmd)

1. Start at `obsidian-qmd/src/domain/search/` — pure query building and result parsing
2. External process: `obsidian-qmd/src/ui/qmd-process-adapter.ts` — calls `qmd` CLI
3. Binary resolution: `resolveExecutablePath()` tries PATH, homebrew, nvm, bun
4. Related notes view: `obsidian-qmd/src/ui/views/qmd-related-view.ts`

### "How does the boiler-template sync work?"

1. Start at `obsidian-boiler-template/tooling/sync/index.mjs` — sync engine core
2. Targets: `obsidian-boiler-template/tooling/sync/targets.json` — which plugins to sync
3. Per-plugin config: `<plugin>/boiler.config.mjs` — overrides and skip lists
4. CLI: `node scripts/sync-to-plugins.mjs [--dry-run | --check | --targets=...]`

### "How does the Eagle image upload work?" (obsidian-eagle-plugin)

1. Start at `obsidian-eagle-plugin/src/domain/` — hash-based deduplication logic
2. Eagle API adapter: `obsidian-eagle-plugin/src/ui/eagle-adapter.ts`
3. Cache: `EagleHashStore` — content hash for image deduplication

---

## Data Flow

How an Obsidian event flows through the 4-layer architecture:

```
Obsidian Event (file save, command, etc.)
    │
    ▼
ui/ handler (event listener, command callback)
    │
    ▼
domain/ processor (pure logic, no side effects)
    │
    ▼
ui/ renderer (Notice, View update, DOM mutation)
```

Example — QMD search triggered by user:

```
User types query in QMD view
    │
    ▼
ui/views/qmd-search-view.ts  →  captures input
    │
    ▼
domain/search/query-builder.ts  →  builds multi-line query (lex + vec)
    │
    ▼
ui/qmd-process-adapter.ts  →  spawns qmd CLI process
    │
    ▼
domain/search/result-parser.ts  →  parses stdout into typed results
    │
    ▼
ui/views/qmd-search-view.ts  →  renders results in Obsidian view
```

---

## Feature → File Mapping

| Feature | Plugin | Start Here |
|---------|--------|------------|
| Layer architecture | all | `<plugin>/src/main.ts` |
| Plugin settings UI | all | `<plugin>/src/ui/settings*.ts` |
| Embedding engine | open-connections | `open-connections/src/domain/kernel/` |
| Semantic search | obsidian-qmd | `obsidian-qmd/src/domain/search/` |
| Image upload | obsidian-eagle-plugin | `obsidian-eagle-plugin/src/domain/` |
| Bible verse search | obsidian-bible-search | `obsidian-bible-search/src/domain/` |
| AI classification | Metadata-Auto-Classifier | `Metadata-Auto-Classifier/src/domain/` |
| YouTube playback | youtube-note-playlist | `youtube-note-playlist/src/domain/` |
| Template sync engine | obsidian-boiler-template | `obsidian-boiler-template/tooling/sync/` |
| Release pipeline | obsidian-boiler-template | `obsidian-boiler-template/scripts/release.mjs` |
| CI workflow generation | obsidian-boiler-template | `obsidian-boiler-template/tooling/sync/index.mjs` |

---

## Study Paths

### Path 1: Understand the Layer Architecture

1. Read [Architecture](architecture.md) — the 4-layer model
2. Read [Rules](rules.md) — what each layer can and cannot do
3. Pick any plugin, open `src/main.ts` — trace how it imports from each layer
4. Run `rg "import.*from 'obsidian'" <plugin>/src/domain/` — should return zero hits

### Path 2: Understand the Boiler-Template Sync

1. Read `obsidian-boiler-template/CLAUDE.md` — overview of the sync model
2. Read `obsidian-boiler-template/tooling/sync/targets.json` — which plugins are synced
3. Read any plugin's `boiler.config.mjs` — per-plugin overrides
4. Run `diff <(ls obsidian-boiler-template/src/shared/) <(ls <plugin>/src/shared/)` — compare shared modules

### Path 3: Trace an Event End-to-End

1. Pick a plugin feature (e.g., "find related notes" in QMD)
2. Find the command registration: `rg "addCommand" obsidian-qmd/src/`
3. Follow the callback into `ui/` handler → `domain/` logic → `ui/` renderer
4. Note: domain/ should have zero `import` from `obsidian`

### Path 4: Add a New Pattern

1. Read [Patterns](patterns.md) — understand the format
2. Implement the pattern in one plugin, verify it works
3. If it's reusable, add it to `obsidian-boiler-template/src/shared/`
4. Run `pnpm sync:plugins --dry-run` to see propagation
5. Document it in `docs/patterns.md`

---

## Grep Patterns

Useful commands for navigating the monorepo:

```bash
# Find all plugin entry points
rg "extends Plugin" */src/main.ts

# Find all registered commands
rg "addCommand" */src/

# Find all event registrations
rg "registerEvent" */src/ui/

# Find all settings UI
rg "new Setting" */src/ui/

# Find all Notice usage
rg "new Notice\|showNotice" */src/

# Find layer violations (obsidian imports in domain/)
rg "import.*from 'obsidian'" */src/domain/

# Find all DebounceController usage
rg "DebounceController" */src/

# Find all adapter injection patterns
rg "execFileAsync|ExecFileAsync" */src/

# Find all shared modules
ls */src/shared/

# Find ESLint no-restricted-imports config
rg "no-restricted-imports" */eslint*

# Find boiler.config overrides
rg "skipDestinations|sync" */boiler.config.mjs
```

---

## See Also

- [Architecture](architecture.md) — Layer structure, dependency rules
- [Rules](rules.md) — Code enforcement (SRP, LOC limits, no catch-alls)
- [Patterns](patterns.md) — Proven implementation patterns
- [Gotchas](gotchas.md) — Known pitfalls and edge cases
- [Obsidian API](obsidian-api.md) — API quirks and workarounds
- [Collaboration](collaboration.md) — Agent roles and handoff protocol
