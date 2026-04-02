# Architecture

> How every Obsidian plugin in this monorepo is structured internally.

## Quick Start

| What | Where |
|------|-------|
| Plugin entry point | `<plugin>/src/main.ts` |
| Business logic | `<plugin>/src/domain/` |
| Obsidian UI + I/O | `<plugin>/src/ui/` |
| Shared modules (synced) | `<plugin>/src/shared/` |
| Pure types | `<plugin>/src/types/` |
| Pure functions | `<plugin>/src/utils/` |
| Sync engine | `obsidian-boiler-template/tooling/sync/` |
| Per-plugin config | `<plugin>/boiler.config.mjs` |

New here? Read the [Exploration Guide](exploration-guide.md) for study paths and grep patterns.

---

## Layered Architecture

Every plugin follows the same 4-layer folder structure:

```
src/
├── main.ts      # Composition root — wires everything, imports from all layers
├── domain/      # Business logic — NO obsidian imports, testable in isolation
├── ui/          # Obsidian-dependent — views, modals, settings, commands, adapters with I/O
├── types/       # Pure type definitions — NO obsidian imports
├── utils/       # Pure functions — zero state, zero external dependencies
└── shared/      # Boiler-template synced — ONLY deterministic code every plugin needs
```

### Layer Rules

| Layer | `obsidian` import? | Side effects? | Testability |
|-------|--------------------|---------------|-------------|
| `utils/` | **No** | No | Unit test, no mocks |
| `types/` | **No** | No | Type-level only |
| `domain/` | **No** | Injected only | Unit test with simple stubs |
| `ui/` | Yes | Yes (DOM/I/O) | Integration test |
| `shared/` | Yes | Yes | Tested in boiler template |
| `main.ts` | Yes | Yes | Integration test |

### Dependency Direction (One-way)

```
utils/ ──┐
types/ ──┼── domain/ ── ui/ ── main.ts
shared/ ─┘               │
                          └── shared/
```

- `utils/` imports NOTHING from project
- `types/` imports NOTHING
- `domain/` imports from `utils/` and `types/` only — **never** `obsidian`
- `ui/` imports from `domain/`, `utils/`, `types/`, `shared/`, and `obsidian`
- `main.ts` imports from everything (composition root)

### Data Flow

How an Obsidian event flows through the layers:

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

---

## ESLint Enforcement

The `no-restricted-imports` rule in `eslint.config.mts` prevents `domain/`, `types/`, and `utils/` from importing `obsidian`. If a module needs Obsidian API, it belongs in `ui/`, not `domain/`.

Verify layer boundaries with grep:

```bash
# Should return zero hits — domain must not import obsidian
rg "import.*from 'obsidian'" */src/domain/

# Check ESLint config
rg "no-restricted-imports" */eslint*
```

## Obsidian Types in Domain Code

When `domain/` or `utils/` code needs Obsidian types (e.g., `TFile`, `CachedMetadata`), define minimal shim interfaces in `types/` instead:

```typescript
// types/index.ts
export interface FileRef { path: string; }
export interface NoteMetadata { frontmatter?: Record<string, unknown>; }
```

The composition root (`main.ts`) passes real Obsidian objects which satisfy these interfaces via structural typing.

## Deterministic Code vs Patterns

| | **Deterministic Code** (`shared/`) | **Patterns** (`docs/patterns.md`) |
|---|---|---|
| **Rule** | Every plugin needs it | A plugin may or may not need it |
| **Adoption** | Automatic via sync engine | Manual — read and adapt |
| **Examples** | `plugin-logger.ts`, `settings-migration.ts` | `debounce-controller`, `adapter-injection` |

## Boiler Template

`obsidian-boiler-template` is the **source of truth** for shared patterns across all plugins.

- When a new pattern is proven, it is first established in `obsidian-boiler-template`, then propagated to existing plugins via the sync engine
- Never diverge individual plugins from the boiler template pattern without a deliberate reason
- Synced artifacts: scripts, ESLint config, CI/CD workflows, `src/shared/` modules
- Per-plugin overrides via `boiler.config.mjs`

## Monorepo Layout

| Submodule | Purpose | Default Branch |
|-----------|---------|----------------|
| `obsidian-eagle-plugin` | Image upload to Eagle app | `main` |
| `open-connections` | Semantic note connections via embeddings | `main` |
| `Metadata-Auto-Classifier` | AI-powered metadata classification | `master` |
| `obsidian-boiler-template` | Source-of-truth seed template | `master` |
| `obsidian-bible-search` | Bible verse search (private) | `main` |
| `obsidian-qmd` | QMD semantic search integration | `main` |
| `youtube-note-playlist` | YouTube music player via yt-dlp | `main` |

---

## See Also

- [Exploration Guide](exploration-guide.md) — Study paths, grep patterns, feature→file mapping
- [Rules](rules.md) — Code enforcement (SRP, LOC limits, no catch-alls)
- [Patterns](patterns.md) — Proven implementation patterns
- [Gotchas](gotchas.md) — Known pitfalls and edge cases
- [Obsidian API](obsidian-api.md) — API quirks and workarounds
- [Collaboration](collaboration.md) — Agent roles and handoff protocol
