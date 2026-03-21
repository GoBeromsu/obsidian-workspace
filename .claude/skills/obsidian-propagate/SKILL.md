---
name: obsidian-propagate
description: Propagate boiler-template changes to downstream plugins. Use this skill when the user asks to "sync", "propagate", "push template changes", check drift/sync status, or after modifying files under tooling/shared/ or tooling/sync/.
---

# Obsidian Propagate

Sync shared patterns from `obsidian-boiler-template` to all managed downstream plugins.

## Context

The sync engine lives at `obsidian-boiler-template/tooling/sync/index.mjs`. It copies files from `tooling/shared/` to each target and renders generated workflows (CI, Release) from each target's `boiler.config.mjs`.

Managed targets are listed in `tooling/sync/targets.json`:
- obsidian-boiler-template (self)
- obsidian-eagle-plugin
- Metadata-Auto-Classifier
- obsidian-bible-search
- obsidian-qmd
- open-connections

Synced artifacts include: scripts (dev, version, release, release-notes), infra (.editorconfig, eslint.base.js, commitlint, husky hooks), GitHub templates (issue/PR), shared source modules (plugin-notices, plugin-logger, debounce-controller, settings-migration, styles.base.css), and generated CI/Release workflows.

## Workflow

### Step 1: Dry Run (always first)

```bash
cd /Users/beomsu/Documents/Dev/Obsidian-Plugins/obsidian-boiler-template
node scripts/sync-to-plugins.mjs --dry-run
```

If targeting specific plugins:
```bash
node scripts/sync-to-plugins.mjs --dry-run --targets=obsidian-eagle-plugin,obsidian-qmd
```

**Review the output.** Report which files will be CREATED, UPDATED, or DELETED for each target. If no changes are detected, stop here and report "all targets in sync".

### Step 2: Confirm with User

Present a summary table before applying:

| Target | Changes | Details |
|--------|---------|---------|
| plugin-name | 3 | UPDATE ci.yml, CREATE eslint.base.js, ... |

Ask the user to confirm before proceeding.

### Step 3: Branch Check

For each target that will receive changes, check the current branch:

```bash
cd /Users/beomsu/Documents/Dev/Obsidian-Plugins/<target-name>
git branch --show-current
```

If the target is on its default branch (main or master), create a sync branch:
```bash
git checkout -b sync/boiler-template
```

**Never apply sync changes directly to main or master.**

### Step 4: Apply

```bash
cd /Users/beomsu/Documents/Dev/Obsidian-Plugins/obsidian-boiler-template
node scripts/sync-to-plugins.mjs
```

Or selectively:
```bash
node scripts/sync-to-plugins.mjs --targets=obsidian-eagle-plugin,obsidian-qmd
```

### Step 5: Run CI on Each Target

For each target that received changes:
```bash
cd /Users/beomsu/Documents/Dev/Obsidian-Plugins/<target-name>
pnpm run ci
```

Record pass/fail for each.

### Step 6: Status Report

Present a final report:

| Target | Sync | CI | Branch |
|--------|------|----|--------|
| obsidian-eagle-plugin | 3 changes | PASS | sync/boiler-template |
| obsidian-qmd | 1 change | PASS | sync/boiler-template |
| Metadata-Auto-Classifier | 0 (in sync) | -- | -- |

## Drift Detection

When the user asks to "check drift" or "check sync status":

```bash
cd /Users/beomsu/Documents/Dev/Obsidian-Plugins/obsidian-boiler-template
node scripts/sync-to-plugins.mjs --check
```

This runs in dry-run mode and exits non-zero if any target has drifted. Report which targets are drifted and which files differ.

## Safety Rules

1. **Never modify boiler-template files** during propagation. The template is the source of truth; changes flow one direction only.
2. **Always dry-run first.** Never apply without previewing.
3. **Always run CI after sync.** A sync that breaks CI must be fixed before committing.
4. **Respect branch strategy.** Create a `sync/boiler-template` branch if the target is on its default branch.
5. **Do not commit automatically.** After sync + CI pass, let the user decide when to commit.
6. **Per-plugin escape hatches exist.** Each plugin's `boiler.config.mjs` can define `sync.skipDestinations` to opt out of specific files. Respect these.
