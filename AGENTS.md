- Test vault: `$OBSIDIAN_VAULT_PATH` (set this in your shell profile or `~/.claude/settings.json`)
- Vault config: `$OBSIDIAN_VAULT_PATH/.obsidian/`

## Rule
- All messages should be english

## Plugin Development Philosophy

`obsidian-boiler-template` is the **source of truth** for shared patterns across all plugins.

- When a new pattern is proven, it is first established in `obsidian-boiler-template`, then propagated to existing plugins
- Never diverge individual plugins from the boiler template pattern without a deliberate reason
- Shared automation and propagation skills must also treat `obsidian-boiler-template` as the reference implementation

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
| `obsidian-smart-connections` | Semantic note connections via embeddings | `main` |
| `Metadata-Auto-Classifier` | AI-powered metadata classification | `master` |
| `obsidian-boiler-template` | Source-of-truth seed template | `master` |
| `obsidian-bible-search` | Bible verse search (private) | `main` |

## Release Workflow

Every plugin follows the same release pipeline:

1. `pnpm ci` — MUST pass (build + lint + test)
2. `pnpm release:patch`, `pnpm release:minor`, or `pnpm release:major` — lint:fix -> version bump -> auto-push tag
3. GitHub Actions handles the rest (CI + Release workflows)

**IMPORTANT:** `git tag`, `git push --tags`, `gh release`, `npm publish`, and `pnpm publish` are **DENIED** by settings.json. Only `pnpm release:*` is allowed to trigger the release pipeline.

## `.claude/` Structure

```
.claude/
├── agents/        # Custom Claude agent definitions
├── hooks/         # Shared hook scripts (lint-check, post-build-reload, stop-verify)
├── skills/        # Claude-facing project skills
└── settings.json  # Permissions, deny-list, hook config
```

## `.agents/` Structure

```
.agents/
└── skills/        # Codex-facing skill mirror for shared project workflows
```
