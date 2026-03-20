# Knowledge Base Index

Captured development insights for the Obsidian plugins monorepo. One insight per file with YAML frontmatter.

## How to add a new entry

1. Pick the right category: `gotchas/`, `patterns/`, or `obsidian-api/`
2. Create a new `.md` file (kebab-case name, one insight per file)
3. Include YAML frontmatter: `type`, `date`, `plugin`, `tags`, `confidence`
4. Add the entry to this index

## Gotchas

Things that don't work as expected.

| File | Summary | Plugin |
|------|---------|--------|
| [setIcon-replaces-content](gotchas/setIcon-replaces-content.md) | `setIcon()` clears all children of the target element | all |
| [qmd-vec-negation-operator](gotchas/qmd-vec-negation-operator.md) | QMD vec/hyde queries do not support `-term` negation | obsidian-qmd |
| [eslint-no-console-scope](gotchas/eslint-no-console-scope.md) | `no-console` must be scoped to `src/**/*.ts` only | all |
| [pnpm-lockfile-frozen](gotchas/pnpm-lockfile-frozen.md) | CI uses `--frozen-lockfile`; always commit `pnpm-lock.yaml` | all |

## Patterns

Proven code patterns.

| File | Summary | Plugin |
|------|---------|--------|
| [plugin-notices-catalog](patterns/plugin-notices-catalog.md) | Catalog-driven Notice system with typed helpers | all |
| [plugin-logger-structured](patterns/plugin-logger-structured.md) | Structured `[PREFIX] level \| message` logger | all |
| [debounce-controller](patterns/debounce-controller.md) | Debounce with rerun semantics for async operations | qmd, sc |
| [adapter-injection](patterns/adapter-injection.md) | Testable I/O via constructor parameter injection | qmd, sc |
| [state-machine-reducer](patterns/state-machine-reducer.md) | Pure reducer + store for complex state machines | sc |
| [cache-manager](patterns/cache-manager.md) | Hash-based LRU cache for expensive operations | eagle, qmd |
| [process-adapter](patterns/process-adapter.md) | External CLI integration with binary resolution | qmd |

## Obsidian API

API quirks and deprecated patterns.

| File | Summary | Plugin |
|------|---------|--------|
| [notice-setmessage-fragment](obsidian-api/notice-setmessage-fragment.md) | `Notice.setMessage()` moves (not clones) DocumentFragment | all |
