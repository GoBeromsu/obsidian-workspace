---
type: skill
author: "고범수"
scope: obsidian-workspace
public: false
used_by:
  -
created_by: "[[claude]]"
created_at: 2026-03-27
modified_by: "[[claude]]"
modified_at: 2026-03-27
name: obsidian-runtime-debug
description: Debug, profile, and verify Obsidian community plugins in a live vault with the Obsidian CLI. Use when a plugin throws runtime errors, needs a DB or plugin-state reset, must be reinstalled into a test vault, requires DevTools/CDP profiling, or needs screenshot and DOM verification before shipping.
---

# Obsidian Runtime Debug

## Overview

Use this skill to debug a plugin from live runtime state instead of guessing from code alone. Reset only the minimum state needed, probe the plugin with small `obsidian eval` calls, profile focused operations, and verify both runtime health and visible UI state before release.

## Workflow

### 1. Set the target

- Prefer a dedicated test vault such as `$OBSIDIAN_VAULT_PATH` unless the user explicitly wants a different vault.
- Collect the vault name, plugin id, and the exact failure mode: startup error, malformed DB, save failure, stale manifest/version, broken UI, or background timer failure.
- Preserve user settings files such as `data.json` before deleting plugin state.

### 2. Reset state at the right level

- For stale code or manifest state, copy fresh build artifacts from `dist/`, reload the plugin, and restart Obsidian if the loaded version still looks stale.
- For malformed or poisoned SQLite state, disable the plugin, delete only the plugin DB first, then re-enable and reprobe.
- For a full reinstall, preserve `data.json`, remove the plugin directory, copy fresh plugin files, then re-enable.
- Do not delete user settings unless the user explicitly asks for a full config reset.

Use the command recipes in [references/runtime-checklist.md](references/runtime-checklist.md).

### 3. Attach debugging and clear buffers

Start every live session with clean buffers:

```bash
obsidian dev:debug on
obsidian dev:errors clear
obsidian dev:console clear
obsidian vault="VAULT" plugin id=PLUGIN_ID
obsidian dev:errors
obsidian dev:console level=error limit=100
```

- Treat `dev:errors` and `dev:console` as the primary truth for runtime health.
- If the plugin looks missing after a restart, wait a few seconds and try again.

### 4. Probe runtime with small evals

- Prefer several small `obsidian eval` calls over one large combined probe.
- Verify loaded manifest, runtime phase/status, queue lengths, collections, and raw DB access separately.
- If a combined `eval` returns empty output, split it into smaller checks before assuming the plugin failed.

Typical probe sequence:

```bash
obsidian vault="VAULT" eval code="JSON.stringify(app.plugins.plugins['PLUGIN_ID']?.manifest)"
obsidian vault="VAULT" eval code="(async()=>{const p=app.plugins.plugins['PLUGIN_ID']; return JSON.stringify({phase:p?.status_state ?? null, hasSource:Boolean(p?.source_collection), hasBlock:Boolean(p?.block_collection)});})()"
obsidian vault="VAULT" eval code="(async()=>{const p=app.plugins.plugins['PLUGIN_ID']; const db=await p.source_collection.data_adapter.db(); return JSON.stringify(db.exec('SELECT COUNT(*) AS count FROM entities'));})()"
```

### 5. Profile a narrow operation

Use two layers of profiling:

- Use `performance.now()` inside `obsidian eval` for reliable timing of save, init, import, or render work.
- Use CDP profiler only for a single focused operation, not a long combined workflow.

Timing pattern:

```bash
obsidian vault="VAULT" eval code="(async()=>{const p=app.plugins.plugins['PLUGIN_ID']; const t1=performance.now(); await p.source_collection.data_adapter.save(); const t2=performance.now(); await p.block_collection.data_adapter.save(); return JSON.stringify({sourceMs:Math.round(t2-t1), blockMs:Math.round(performance.now()-t2), sourceQueue:p.source_collection.save_queue.length, blockQueue:p.block_collection.save_queue.length});})()"
```

CDP profiler pattern:

```bash
obsidian dev:cdp method=Profiler.enable params='{}'
obsidian dev:cdp method=Runtime.enable params='{}'
obsidian dev:cdp method=Profiler.start params='{}'
# run one focused eval here
obsidian dev:cdp method=Profiler.stop params='{}'
```

- If `Profiler.stop` returns empty output, treat that as a tooling limitation until a functional probe proves otherwise.
- Re-run the runtime probe and timing-based save test after any ambiguous profiler output.

### 6. Verify the UI

- Use `obsidian dev:screenshot` when the user needs visual confirmation or when the issue is layout- or rendering-related.
- Use `obsidian dev:dom` for deterministic checks of visible text, element presence, or toggled state.
- Use `obsidian dev:css` when the bug is styling-specific.

Prefer DOM checks for repeatable verification and screenshots for human-facing proof.

### 7. Recheck background work

- Clear buffers and wait longer than the plugin's timer interval.
- Re-read `dev:errors`, `dev:console`, and queue/phase state afterward.
- A clean manual save is not enough if autosave or background batching still fails later.

### 8. Ship only after the live gate passes

Require all of the following:

- Plugin loads with the intended version.
- `dev:errors` is clean after reload or restart.
- Raw DB access succeeds.
- Focused timed operations succeed.
- Screenshot or DOM verification is acceptable when UI is involved.
- Post-interval checks stay clean.

## Practical Rules

- Preserve `data.json` before reinstalling a plugin.
- Delete only the DB file first when the on-disk state is malformed.
- Use `obsidian restart` if `plugin:reload` leaves the loaded manifest or version stale.
- If a restart leaves the plugin disabled, enable it again and rerun the health checks.
- Keep the release decision tied to live verification, not just tests or build success.
