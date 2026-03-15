---
name: obsidian-propagate
description: Propagate a pattern change from obsidian-boiler-template (source of truth) to downstream Obsidian plugin repos in parallel using subagents. Use when a script, config, or tooling change is established in the boiler template and needs to go to other packages. Trigger on: /obsidian-propagate, '전파해줘', '모든 패키지에 적용해줘', '다른 패키지에도 반영해줘', 'propagate to all packages', 'sync packages', 'monorepo 전파', '패키지 동기화', 'boiler template 전파'. NOT for plugin feature development — use obsidian-developer.
---

# obsidian-propagate

Propagates a confirmed pattern from `obsidian-boiler-template` (reference) to downstream plugin repos using parallel agents — one per package.

## Monorepo Layout

| Package | Path | Branch |
|---------|------|--------|
| **Reference** | `obsidian-boiler-template/` | `master` |
| Target 1 | `obsidian-eagle-plugin/` | `main` |
| Target 2 | `obsidian-smart-connections/` | `main` |
| Target 3 | `Metadata-Auto-Classifier/` | `master` |
| Optional target | `obsidian-bible-search/` | `main` |

Root: `/Users/beomsu/Documents/GitHub/Obsidian/`

## Indentation Convention

- `obsidian-boiler-template/package.json` → tabs
- `Metadata-Auto-Classifier/package.json` → tabs
- `obsidian-eagle-plugin/package.json` → 2-space
- `obsidian-smart-connections/package.json` → 2-space

Match the target file's existing indentation when applying diffs.

## Workflow

### Step 1 — Identify what to propagate

If the user didn't specify, ask: "어떤 파일/패턴을 전파할까요?" Common targets:
- `package.json` scripts (e.g. `release:*`, CI scripts)
- `scripts/version.mjs`
- `.github/workflows/release.yml`
- `eslint.config.js` pattern

Read the reference file from `obsidian-boiler-template/` to understand the current pattern.

### Step 2 — Spawn parallel agents

Launch one agent per downstream package in a single message (parallel). Each agent handles one target package end-to-end: read → diff → edit → commit → push.

**Agent prompt template:**

```
You are propagating a pattern change from obsidian-boiler-template to <PACKAGE_NAME>.

Reference file (already updated, source of truth):
<REFERENCE_FILE_PATH>

Target file:
<TARGET_FILE_PATH>

Change to apply:
<DESCRIPTION_OF_CHANGE>

Instructions:
1. Read both files
2. Apply the equivalent change to the target file, preserving its indentation style
3. Verify the edit looks correct
4. cd into the package directory: git add <file> && git commit -m "chore: propagate <pattern> from boiler-template\n\nCo-Authored-By: Codex Sonnet 4.6 <noreply@anthropic.com>"
5. git push
6. Report: done or error
```

### Step 3 — Report results

After all target agents complete, summarize:
- ✅ / ❌ per package
- Any packages that need manual follow-up

## Example: propagating `release:*` scripts

Reference pattern (boiler template, tabs):
```json
	"release:patch": "pnpm lint:fix && pnpm version patch",
	"release:minor": "pnpm lint:fix && pnpm version minor",
	"release:major": "pnpm lint:fix && pnpm version major"
```

Apply to a 2-space target like `obsidian-eagle-plugin` or `obsidian-smart-connections` with matching indentation:
```json
    "release:patch": "pnpm lint:fix && pnpm version patch",
    "release:minor": "pnpm lint:fix && pnpm version minor",
    "release:major": "pnpm lint:fix && pnpm version major"
```

## Notes

- Each package has its own git remote — always `cd` into the package dir before git commands
- If a target package is structurally different (missing a script entirely), adapt rather than blindly copy
- `obsidian-boiler-template` stays the reference, even if a downstream plugin added extra plugin-specific tooling
- Skip `obsidian-bible-search` if the private repo is not present locally
