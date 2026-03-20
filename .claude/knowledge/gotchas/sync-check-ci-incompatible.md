---
type: gotcha
date: 2026-03-20
plugin: all
tags: [ci, sync-engine, github-actions]
confidence: high
---

# sync:check Cannot Run in GitHub Actions CI

## Context
Added `pnpm sync:check` step to the generated CI workflow (`renderCiWorkflow()`) to enforce boiler-template sync drift detection.

## Discovery
`sync:check` calls `scripts/sync-to-plugins.mjs --check` which resolves target repos relative to the boiler-template root. On GitHub Actions, each plugin runs CI independently — sibling repos don't exist. The sync engine throws "Target repo not found" and CI fails with exit code 254.

## Solution
- **Remove** `sync:check` from the generated CI workflow
- **Keep** `sync:check` in local `release.mjs` (only runs where all repos are siblings)
- **Keep** `sync:check` in boiler-template's own CI (it self-syncs)
- Enforcement chain: local release pipeline catches drift before tags are pushed

## References
- File: `tooling/sync/index.mjs` renderCiWorkflow()
- Fix commit: "fix(ci): remove sync:check from CI workflow + add packageManager"
