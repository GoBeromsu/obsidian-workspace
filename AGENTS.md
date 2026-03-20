- Test vault: `$OBSIDIAN_VAULT_PATH` (set this in your shell profile or `~/.claude/settings.json`)
- Vault config: `$OBSIDIAN_VAULT_PATH/.obsidian/`

## Rule
- All messages should be english

## Agent Team (3 agents, separation of concerns)

| Agent | Role | Owns |
|-------|------|------|
| `obsidian-developer` | Implementation — domain logic, infrastructure, wiring | `src/main.ts`, `src/domain/`, `src/types/`, `src/utils/`, `src/shared/`, `src/ui/embedding/`, `src/ui/models/`, `worker/`, `test/` |
| `obsidian-ui` | UX design + visual implementation | `src/ui/settings*.ts`, `src/ui/connections/`, `src/ui/lookup/`, `src/ui/views/`, `src/styles.css` |
| `obsidian-qa` | Runtime verification (obsidian-cli) + static code review | All files (read), fixes where needed |

### When to use which
- **Feature implementation**: developer (logic) + ui (visual) in parallel, then qa to verify
- **Bug fix**: developer fixes, qa verifies
- **UI/UX work**: ui designs + implements, qa screenshots to verify
- **Code review**: qa runs static checks + runtime verification
- **Planning**: Main context — NOT a subagent task

## Plugin Development Philosophy

`obsidian-boiler-template` is the **source of truth** for shared patterns across all plugins.

- When a new pattern is proven, it is first established in `obsidian-boiler-template`, then propagated to existing plugins
- Never diverge individual plugins from the boiler template pattern without a deliberate reason

## Layered Architecture (All Plugins)

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

### ESLint Enforcement

The `no-restricted-imports` rule in `eslint.base.js` prevents `domain/`, `types/`, and `utils/` from importing `obsidian`. If a module needs Obsidian API, it belongs in `ui/`, not `domain/`.

### Deterministic Code vs Patterns

| | **Deterministic Code** (`shared/`) | **Patterns** (`.claude/knowledge/patterns/`) |
|---|---|---|
| **Rule** | Every plugin needs it | A plugin may or may not need it |
| **Adoption** | Automatic via sync engine | Manual — read and adapt |
| **Examples** | `plugin-logger.ts`, `settings-migration.ts` | `debounce-controller`, `adapter-injection` |

### Obsidian Types in Domain Code

When `domain/` or `utils/` code needs Obsidian types (e.g., `TFile`, `CachedMetadata`), define minimal shim interfaces in `types/` instead:

```typescript
// types/index.ts
export interface FileRef { path: string; }
export interface NoteMetadata { frontmatter?: Record<string, unknown>; ... }
```

The composition root (`main.ts`) passes real Obsidian objects which satisfy these interfaces via structural typing.

## Git & Branch Strategy

- `main` — always production-ready; no direct commits
- `feature/<name>` — new functionality; branched from `main`
- `fix/<name>` — bug fix; branched from `main`
- `refactor/<name>` — internal improvements; branched from `main`
- Use PRs for merging into `main` only

## Obsidian Plugin Config Access

- Read config files directly (not via UI screenshots)
- Investigate config conflicts before suggesting restarts

## Monorepo Layout

| Submodule | Purpose | Default Branch |
|-----------|---------|----------------|
| `obsidian-eagle-plugin` | Image upload to Eagle app | `main` |
| `obsidian-smart-connections` (plugin ID: `open-connections`) | Semantic note connections via embeddings | `main` |
| `Metadata-Auto-Classifier` | AI-powered metadata classification | `master` |
| `obsidian-boiler-template` | Source-of-truth seed template | `master` |
| `obsidian-bible-search` | Bible verse search (private) | `main` |
| `obsidian-qmd` | QMD semantic search integration | `main` |

## Release Workflow

Every plugin follows the same release pipeline:

1. `pnpm run ci` — MUST pass (build + lint + test)
2. `pnpm release:patch`, `pnpm release:minor`, or `pnpm release:major` — run CI -> version bump -> auto-push tag
3. GitHub Actions handles the rest (CI + Release workflows)

**IMPORTANT:** `git tag`, `git push --tags`, `gh release`, `npm publish`, and `pnpm publish` are **DENIED** by settings.json. Only `pnpm release:*` is allowed to trigger the release pipeline.

## Knowledge Base

`.claude/knowledge/` captures development insights discovered during sessions.

- **gotchas/**: Things that don't work as expected
- **patterns/**: Proven code patterns
- **obsidian-api/**: API quirks and deprecated patterns

The Stop hook reminds to capture new learnings. One insight per file with YAML frontmatter.

See [INDEX.md](.claude/knowledge/INDEX.md) for the full catalog.

## `.claude/` Structure

```
.claude/
├── agents/        # Custom agent definitions (obsidian-developer, obsidian-qa, obsidian-ui)
├── skills/        # Invocable skills (obsidian-propagate, readme-guide, release)
├── hooks/         # PostToolUse and Stop hooks (lint-check, post-build-reload, stop-verify, knowledge-capture)
├── knowledge/     # Development insights (gotchas, patterns, obsidian-api) — see INDEX.md
├── commands/      # Legacy commands
└── settings.json  # Permissions, deny-list, hooks config
```
