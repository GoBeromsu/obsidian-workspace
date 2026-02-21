## Project Overview

Obsidian plugin development monorepo containing 3 plugins. Each plugin has its own folder and plugin-specific guidance.

- Test vault: `~/Documents/Obsidian/Ataraxia/`
- Vault config: `~/Documents/Obsidian/Ataraxia/.obsidian/`

## Working Principles

- **Research before implementing**: Investigate API/package capabilities first. Never substitute a user-specified package with an alternative
- **Implement first**: If it can be done in this session, do it now. Only produce plan documents when explicitly requested
- **Root cause debugging**: If the first fix doesn't work, trace the root cause (missing initialization, missing registration, etc.) instead of treating symptoms
- **Incremental refactoring**: Break large changes into small steps — verify build + commit after each step
- **Data accuracy**: When working with accounting/financial data, always cross-check against source data
- **Config scope**: Place skills/config in project-local `.claude/` directory
- **Read config files directly**: Read Obsidian config files instead of relying on UI screenshots. Investigate config conflicts before suggesting "restart Claude Code" as a fix

## Engineering Standards

> Apply to all plugins. [MUST] = mandatory. [SHOULD] = recommended, adopt incrementally.

### Code Quality & Linting
- [MUST] Every project must have a linter runnable via `lint` script
- [MUST] Lint must pass before code reaches the default branch (pre-commit hook or CI)
- [SHOULD] Enforce no circular imports (`import/no-cycle` or equivalent)
- [SHOULD] Enforce consistent import ordering via linter plugin

### Formatting
- [MUST] Every project must have a code formatter with committed config
- [SHOULD] Include `.editorconfig` for cross-editor consistency
- [SHOULD] Track bulk formatting commits in `.git-blame-ignore-revs`

### Pre-commit Hooks
- [SHOULD] Run linter + formatter on staged files only (lint-staged pattern)
- [SHOULD] Validate commit messages against Conventional Commits via hook
- [MUST] Disable hooks in CI (`HUSKY=0`) to avoid redundant checks

### Testing
- [MUST] Every project must have tests runnable via `test` script
- [MUST] Tests must run in CI and block merge on failure
- [SHOULD] Mock external platform APIs (especially Obsidian API) for unit tests
- [SHOULD] Collect and report test coverage (trend metric, not hard gate)
- [SHOULD] Test files should mirror or co-locate with source structure

### Architecture
- [MUST] Separate source into modules by responsibility (API, logic, UI, utilities)
- [SHOULD] Enforce module boundaries with linter plugins where feasible
- [MUST] Build output (`main.js`, `dist/`) in `.gitignore`, never committed

### Dependency Management
- [MUST] All plugins use **pnpm** — commit `pnpm-lock.yaml`, never `yarn.lock` or `package-lock.json`
- [MUST] Use frozen installs in CI (`pnpm install --frozen-lockfile`)
- [MUST] `"packageManager": "pnpm@10.28.2"` in every `package.json`
- [SHOULD] Periodically audit dependencies for vulnerabilities and remove unused packages

### CI/CD
- [MUST] Every project must have CI: install (frozen) → build → lint → test on every push and PR
- [MUST] CI triggers on both default branch pushes and PR events
- [SHOULD] Publish test results and coverage as CI artifacts
- [SHOULD] Run static analysis / quality scans beyond basic linting

### Release
- [MUST] Releases triggered by pushing a semver git tag
- [MUST] Release artifacts must include Obsidian-required files (`main.js`, `manifest.json`, etc.)
- [MUST] Validate version consistency across `package.json` and `manifest.json` before release
- [SHOULD] Use `gh` CLI for release creation

### TypeScript & Type Safety
- [MUST] Enable `noImplicitAny` (TS) or use JSDoc annotations (JS)
- [MUST] Enable `isolatedModules` for esbuild compatibility
- [SHOULD] Enable `strictNullChecks`
- [SHOULD] Enable `forceConsistentCasingInFileNames`
- [SHOULD] Adopt stricter flags progressively (one per refactoring cycle)

### Security
- [MUST] Never commit secrets/tokens/`.env` — use `.gitignore` + CI secret management
- [MUST] Scope CI workflow permissions to minimum required (`permissions:` block)

### Developer Experience
- [SHOULD] Provide `.vscode/extensions.json` with recommended extensions
- [SHOULD] Configure format-on-save in `.vscode/settings.json`
- [MUST] Support hot-reload dev workflow (documented in each plugin's docs)
- [MUST] Document all build/test/lint/dev commands in each plugin's docs
- [SHOULD] Provide structured GitHub issue templates

## Plugin Quick Reference

| Plugin | Dir | Build | Test | Lint | Package Manager |
|--------|-----|-------|------|------|-----------------|
| Open Smart Connections | `obsidian-smart-connections/` | `pnpm run build` | `pnpm run test` (Vitest) | `pnpm run lint` | pnpm |
| Eagle Plugin | `obsidian-eagle-plugin/` | `pnpm run build` | `pnpm run test` (Vitest) | `pnpm run lint` | pnpm |
| Metadata Auto Classifier | `Metadata-Auto-Classifier/` | `pnpm run build` | `pnpm run test` (Vitest) | `pnpm run lint` | pnpm |

> **Toolchain**: Node 20 LTS, pnpm 10.28.2 (Corepack), Vitest for all plugins.

## Git & Branch Strategy

All plugins follow a **GitHub-style feature branch workflow**.

- `main` — always production-ready; no direct commits
- `feature/<name>` — new functionality; branched from `main`
- `fix/<name>` — bug fix; branched from `main`
- `refactor/<name>` — internal improvements; branched from `main`

**Workflow Principles**

- Always create a branch from `main` before starting work
- Branch names describe _purpose_, not implementation details
- Use PRs for merging into `main` only
- Keep branches short-lived and focused on one concern

## Commit Convention

All plugins follow **Conventional Commits**.

```
<type>(<scope>): <description>
```

Allowed types: `feat` | `fix` | `docs` | `refactor` | `perf` | `test` | `build` | `ci` | `chore`

- Eagle Plugin enforces commitlint via `.commitlintrc.yaml` and Husky commit-msg hook
- MAC enforces lint-staged via Husky pre-commit hook

## Release Management

Use **`gh` CLI** for all GitHub releases across all plugins.

- Use our own version tags (ignore upstream versions)
- Eagle: own semver tags (e.g., `v1.0.0`)
- SC: own tags like `v1.0.3`, `v2.0.1` (ignore upstream 4.x). Requires `GH_REPO` + `GH_TOKEN` env vars in `.env`
- MAC: own semver tags

```bash
# Create a release with gh CLI
gh release create v1.x.x --title "v1.x.x" --notes "Release notes here"
```

## Development Workflow

### Hot Reload

Standard pattern using `scripts/dev.mjs` (shared across all plugins):
1. Discover Obsidian vaults from `obsidian.json`
2. Select vault interactively (or via `VAULT_PATH` env / `--vault` CLI flag)
3. Mount plugin into vault's `.obsidian/plugins/<id>/`
4. Create `.hotreload` file, start esbuild watch
5. Sync build output to vault directory on changes

### Obsidian CLI

Use Obsidian CLI for plugin development and testing:
- `obsidian plugin:reload id=<plugin-id>`: Reload after build
- `obsidian eval code="..."`: Execute JS in Obsidian
- `obsidian dev:errors`: Check console errors
- `obsidian dev:screenshot`: Capture screenshots
- Run `obsidian help` for full command reference

## Obsidian Plugin Config Access

- Read config files directly (not via UI screenshots)
- Investigate config conflicts before suggesting restarts
- Vault config path: `~/Documents/Obsidian/Ataraxia/.obsidian/`
****