- Test vault: `$OBSIDIAN_VAULT_PATH` (set this in your shell profile or `~/.claude/settings.json`)
- Vault config: `$OBSIDIAN_VAULT_PATH/.obsidian/`

## Rule
- All messages should be english

## Plugin Development Philosophy

`obsidian-boiler-template` is the **source of truth** for shared patterns across all plugins.

- When a new pattern is proven, it is first established in `obsidian-boiler-template`, then propagated to existing plugins
- Never diverge individual plugins from the boiler template pattern without a deliberate reason

## Git & Branch Strategy

- `main` — always production-ready; no direct commits
- `feature/<name>` — new functionality; branched from `main`
- `fix/<name>` — bug fix; branched from `main`
- `refactor/<name>` — internal improvements; branched from `main`
- Use PRs for merging into `main` only

## Obsidian Plugin Config Access

- Read config files directly (not via UI screenshots)
- Investigate config conflicts before suggesting restarts