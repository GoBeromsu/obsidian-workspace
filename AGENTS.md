# Repository Guidelines

## Project Overview

A **linked workspace and portfolio control plane** for independent Obsidian plugin repositories — not a package monorepo. The root owns the plugin map, documentation, a report-only release gate, and a local development workbench. Plugin implementation and release authority live in child repos.

- Child plugins are git-ignored local clones materialized from `workspace/plugins.manifest.json` (9 entries: 8 `linked`, 1 `root-local`).
- **Exception:** `hermes-cron-viewer/` is tracked in this repo (112 files) and is the one in-repo plugin.
- Shared deterministic modules originate in `obsidian-boiler-template` and propagate downstream; never edit a plugin's `src/shared/` directly.

## Architecture & Data Flow

Three separate systems live here. Do not blur them.

**1. Control plane — `workspace/*.mjs` (Node ESM)**

```
plugins.manifest.json ──▶ validate-manifest.mjs   (schema/enum/slug/policy gates)
                     ├──▶ generate-catalog.mjs    (writes docs/workspace-catalog.md)
                     ├──▶ bootstrap.mjs           (clones only missing repos; never fetch/checkout/delete)
                     └──▶ release-readiness-report.mjs (queries `gh`, writes .artifacts/*, report-only)
```

**2. Dev workbench — `workspace/dev*.mjs`**

```
dev.mjs (init|list|build|watch|verify)
  └─ dev-config.mjs    .env + process env → only <root>/.dev-vault; strips NODE_OPTIONS/NODE_PATH
  └─ dev-selection.mjs manifest selector → Eagle only; SHA-256-pins child build scripts
  └─ dev-cycle.mjs     discoverRuntime → acquire .dev-cycle.lock → runBuild → deployArtifacts
                       → reloadPlugin → verifyPlugin  (lock released in `finally`)
       ├─ dev-build.mjs   detached, shell-less spawn of the audited esbuild entry
       ├─ dev-deploy.mjs  stages main.js / manifest.json / optional styles.css via UUID temp + rename
       ├─ dev-runtime.mjs `obsidian vault=.dev-vault eval …`, sentinel-framed JSON receipts
       └─ dev-watch.mjs   recursive watch, coalesced serial cycles
```

Critical contract: `runtime.configDir` is the **vault-relative** string from `app.vault.configDir` (e.g. `.obsidian`, `live-config`). `validateConfigDir(config, relative)` returns an absolute path **for filesystem use only** — never store it on a receipt. `deployArtifacts(config, selection, runtime.configDir)` always receives the relative form.

**3. Plugin runtime — TypeScript, layered**

```
main.ts (composition root: construct collaborators, register views/commands, restore data)
  └─ ui/      Obsidian + Node I/O, views, modals, adapters, stateful stores
       └─ domain/  pure logic: parsers, builders, validators, reducers  (never imports obsidian)
            └─ types/ utils/  leaves, zero project/runtime dependencies
```

Hermes data flow: `main.ts` injects `SshReadOnlyAdapter` + `RefreshScheduler` → `ui/viewer-state.ts` refreshes → `ui/hermes-snapshot-collector.ts` fans out per server (concurrency 2) → `domain/*-parser.ts` bound and parse → successful projections persist via `ui/snapshot-disk-store.ts`; job/output bodies stay in memory and are never persisted.

## Key Directories

| Path | Purpose |
|------|---------|
| `workspace/` | Control-plane + workbench scripts, manifest, `dev-*.test.mjs` suites |
| `docs/` | Canonical contracts: `rules.md`, `architecture.md`, `patterns.md`, `gotchas.md`, `collaboration.md`, `harness-contract.md`, `release-architecture.md` |
| `hermes-cron-viewer/src/` | Tracked plugin: `main.ts`, `ui/`, `domain/`, `types/`, `utils/` |
| `hermes-cron-viewer/tests/` | Bun test suites + `obsidian-harness.ts`, `fixtures/` |
| `.github/workflows/` | `release-gate-report.yml` — the only CI gate |
| `.dev-vault/` | Git-ignored owned workbench vault (marker `.workbench-vault.json`) |
| `obsidian-eagle-plugin/`, `obsidian-qmd/`, … | Git-ignored clones from the manifest |

## Development Commands

Run from the repository root.

```bash
# Control plane (no dependencies, plain Node)
node workspace/bootstrap.mjs                 # clone missing linked repos only
node workspace/validate-manifest.mjs         # add --require-local to also require checkouts
node workspace/generate-catalog.mjs          # regenerates docs/workspace-catalog.md
node workspace/release-readiness-report.mjs --markdown-out .artifacts/release-readiness.md \
  --json-out .artifacts/release-readiness.json          # needs authenticated `gh`

# Dev workbench (Eagle-only; no implicit selector)
node workspace/dev.mjs list                              # works without vault config
OBSIDIAN_VAULT_PATH=.dev-vault node workspace/dev.mjs init
obsidian vault=.dev-vault                                # open the dedicated vault first
OBSIDIAN_VAULT_PATH=.dev-vault node workspace/dev.mjs build eagle
OBSIDIAN_VAULT_PATH=.dev-vault node workspace/dev.mjs watch eagle
OBSIDIAN_VAULT_PATH=.dev-vault node workspace/dev.mjs verify eagle

# Workbench tests
node --test workspace/dev-safety.test.mjs workspace/dev-runtime.test.mjs \
  workspace/dev-cycle.test.mjs workspace/dev-watch.test.mjs
```

```bash
# hermes-cron-viewer (Bun)
cd hermes-cron-viewer && bun run build && bun run typecheck && bun test

# obsidian-eagle-plugin (pnpm, inside the ignored clone)
cd obsidian-eagle-plugin && pnpm run ci    # build && typecheck && lint && test
```

## Code Conventions & Common Patterns

**Blocking rules (`docs/rules.md` — violations stop work):**

1. `index.ts` holds re-exports, factory composition, and wiring only.
2. No catch-all `utils.ts` / `helpers.ts` / `service.ts` / `common.ts`; name modules after their responsibility.
3. One nameable responsibility per `.ts` file; split I/O from pure logic, types from implementation.
4. ≤ 200 logic LOC per `.ts`/`.tsx` (blank/comment/prompt-string lines excluded; round up when unsure).
5. Obsidian-native UI only — no `innerHTML`, inline styles, or hardcoded colors; use `Setting`, `setIcon()`, `createEl()`, and `var(--*)` theme tokens.
6. Never hardcode `.obsidian` in runtime code; derive paths from `app.vault.configDir`.

Enforcement greps: `rg "import.*from 'obsidian'" */src/domain/ */src/utils/ */src/types/`, `rg "innerHTML" */src/ui/`, `rg -n "\.obsidian" */src/ --glob="*.ts"`.

**Naming**

- Hermes source: kebab-case files (`snapshot-disk-store.ts`, `read-command-builder.ts`).
- Eagle: PascalCase for class/modal files (`EagleUploader.ts`), kebab-case for functional modules (`folder-mapping.ts`).
- `workspace/*.mjs`: kebab-case files, camelCase functions, `SCREAMING_SNAKE_CASE` constants, verb-led exports (`loadConfig`, `selectPlugin`, `runCycle`, `deployArtifacts`).
- PascalCase types/classes, camelCase functions/fields, `UPPER_SNAKE_CASE` constants everywhere.

**Error handling**

- Domain/transport results use explicit result objects: `return { ok: false, reason: "parse-failed", detail: String(error) };` (`hermes-cron-viewer/src/domain/response-bound.ts`).
- Integration layers throw typed errors (`EagleApiError`) and preserve `AbortError`; callers branch on error kind rather than string matching.
- Workbench modules fail closed through `fail()` / `assert*` / `validate*` helpers **before** any mutation; cleanup only in `finally`.

**Async**

- Fire-and-forget is explicit: `void this.activateView(...)`.
- `Promise.all` for batching, `Promise.allSettled` for best-effort work, debounce/scheduler state (`running`/`pending`, `dirty`) to coalesce reruns instead of dropping the final event.

**Dependency injection**

- Constructor injection of runners, adapters, clocks and callbacks: `new SshReadOnlyAdapter({ runner: childProcessRunner })`, `new RefreshScheduler(() => this.state.refresh())`.
- `runCycle(config, selection, { signal, runBuild, discoverRuntime, deployArtifacts, reloadPlugin, verifyPlugin })` — injected stages replace defaults 1:1, which is how the workbench is tested without Obsidian.

**State & persistence**

- Serialize read-modify-write around `plugin.loadData()` / `plugin.saveData()` (`hermes-cron-viewer/src/ui/plugin-data-gateway.ts`) so concurrent writers cannot drop data; merge into the existing object rather than overwriting.
- Workbench output is one `JSON.stringify(payload)` record per event; `ok:false` → stderr, everything else → stdout; usage errors exit 2, operational errors exit 1.

**Path safety (workbench)**: `safeChild`, `assertNoSymlinkComponents`, `validateConfigDir`, `realInside` reject traversal, NUL bytes, symlink escapes, and hardlinked destinations. Plugin IDs must match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.

## Important Files

| File | Role |
|------|------|
| `workspace/plugins.manifest.json` | Single source of truth for the portfolio |
| `workspace/dev.mjs` | Workbench CLI entry (`init|list|build|watch|verify`) |
| `workspace/dev-cycle.mjs` | Stage ordering, exclusive `.dev-cycle.lock` |
| `workspace/dev-vault.mjs` | Vault ownership marker, containment and configDir validation |
| `workspace/dev-runtime.mjs` | Obsidian CLI eval bridge and runtime receipts |
| `hermes-cron-viewer/src/main.ts` | Hermes composition root |
| `hermes-cron-viewer/src/ui/viewer-state.ts` | Shared state, refresh merge policy, persistence |
| `hermes-cron-viewer/esbuild.config.mjs` | Bundles CJS for Obsidian (`es2022`, obsidian/electron external) |
| `.env.example` | Only `OBSIDIAN_VAULT_PATH=.dev-vault` |
| `.github/workflows/release-gate-report.yml` | Manifest validation + catalog + readiness report |

## Runtime/Tooling Preferences

- **Root has no `package.json` and no dependencies.** Control-plane and workbench scripts are plain Node ESM `.mjs` with `node:` builtins. Do not introduce a root package manager.
- Node: `README.md` requires **Node 24+**; CI pins **Node 22** (`release-gate-report.yml`). Keep root scripts compatible with both — currently verified on Node 24.21.0.
- `hermes-cron-viewer` → **Bun** (`bun.lock`, `@types/bun`). `obsidian-eagle-plugin` → **pnpm@10.28.2** (`packageManager`). Never cross the two toolchains.
- Workbench runtime verbs require the `obsidian` CLI on `PATH`, with `.dev-vault` registered via **Open folder as vault**. Never rewrite the Obsidian vault registry.
- `.env` and `.dev-vault/` are git-ignored and local-only. The workbench refuses any vault other than `<root>/.dev-vault`; never point it at a production vault.

## Testing & QA

- Workspace: `node --test workspace/dev-*.test.mjs` (63 tests — safety, runtime receipts, cycle ordering, watcher).
- Hermes: `bun test` (`hermes-cron-viewer/tests/`, with `obsidian-harness.ts` and `fixtures/`).
- Eagle: `vitest run` via `pnpm test`; E2E via `pnpm e2e` (wdio).
- Test observable behavior, edge values, and failure paths. Workbench tests use disposable temp vaults and a fake `obsidian` executable (`workspace/dev-test-fixture.mjs`) — never invoke the real CLI or touch `.dev-vault` from tests.
- Definition of Done (`docs/collaboration.md`): build, lint, tests where present, layer/rule compliance, and QA verification for non-trivial changes.
- Runtime smoke loop: build → deploy → reload → verify, then `obsidian vault=.dev-vault dev:errors` for a clean error buffer.

## Release & Contribution Policy

- Branch `feature/<name>` / `fix/<name>` / `refactor/<name>` from `main`; Conventional Commits; PR into `main`. No direct commits to `main`.
- Releases are **CI-only**. Never run `git tag`, `git push --tags`, `gh release`, or `npm publish` locally.
- The root gate is report-only: it validates manifest metadata and emits a readiness report without taking release authority from child repos.
