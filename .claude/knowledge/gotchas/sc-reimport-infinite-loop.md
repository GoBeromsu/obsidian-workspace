---
type: gotcha
date: 2026-03-20
plugin: obsidian-smart-connections
tags: [embedding, lifecycle, timer, race-condition]
confidence: high
---

# Open Connections Re-Import Infinite Loop After Reload

## Context
Plugin reload (disable → enable) causes an infinite re-import loop filling the console.

## Discovery
`_unloading` flag is set in `onunload()` but old timer callbacks from the previous instance survive and keep running. `runEmbeddingJobNow` rejects with "plugin is unloading" → queue never shrinks → `deferReImport` schedules again → infinite loop.

## Immediate Fix
- Reset `_unloading = false` in `onload()`
- Guard `deferReImport` with `!plugin._unloading` check

## Root Cause (Needs Deeper Fix)
The embedding lifecycle is too complex:
- Multiple timer layers (re_import_timeout, re_import_retry_timeout, deferRetryCount)
- FSM kernel with 21 event types
- Race condition between unload and async operations

QMD solves the same problem with `AutoSyncController` (simple debounce + rerun) + external process. The SC embedding pipeline should be simplified.

## References
- `src/app/file-watcher.ts` lines 218-221 (re-import loop)
- `src/app/main.ts` line 142 (_unloading flag)
- `src/features/embedding/embedding-manager.ts` line 626 (guard)
