---
type: gotcha
date: 2026-03-20
plugin: all
tags: [pnpm, ci, lockfile, frozen-lockfile]
confidence: high
---

# CI uses --frozen-lockfile, must commit pnpm-lock.yaml

## Context
Setting up CI workflows for Obsidian plugins using pnpm.

## Discovery
GitHub Actions CI runs `pnpm install --frozen-lockfile` by default (when using `pnpm/action-setup`). This flag refuses to modify `pnpm-lock.yaml` and fails the build if the lockfile is out of sync with `package.json`.

Common failure scenario:
1. Developer adds a dependency with `pnpm add <pkg>`
2. Commits `package.json` but forgets to commit `pnpm-lock.yaml`
3. CI fails with "ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE"

## Solution
Always commit `pnpm-lock.yaml` alongside `package.json` changes:

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add new-dependency"
```

If the lockfile is already out of sync:
```bash
pnpm install          # regenerates pnpm-lock.yaml
git add pnpm-lock.yaml
git commit -m "chore: sync lockfile"
```

Ensure `.gitignore` does NOT include `pnpm-lock.yaml`.

## References
- pnpm docs: https://pnpm.io/cli/install#--frozen-lockfile
- GitHub Actions pnpm setup: `pnpm/action-setup`
