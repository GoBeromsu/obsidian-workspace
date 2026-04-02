# Obsidian Runtime Debug Checklist

Use these command patterns as templates. Replace `VAULT`, `PLUGIN_ID`, and file paths before running them.

## 1. Clean reload baseline

```bash
obsidian dev:debug on
obsidian dev:errors clear
obsidian dev:console clear
obsidian vault="VAULT" plugin:reload id=PLUGIN_ID
obsidian vault="VAULT" plugin id=PLUGIN_ID
obsidian dev:errors
obsidian dev:console level=error limit=100
```

Use this when the code changed but you do not yet suspect broken on-disk state.

## 2. DB reset only

Use this when the plugin code is correct but the local SQLite file is malformed or poisoned.

```bash
VAULT_DIR="/absolute/path/to/vault"
PLUGIN_DIR="$VAULT_DIR/.obsidian/plugins/PLUGIN_ID"
DB_PATH="$PLUGIN_DIR/PLUGIN_ID.db"

obsidian vault="VAULT" plugin:disable id=PLUGIN_ID || true
rm -f "$DB_PATH"
obsidian vault="VAULT" plugin:enable id=PLUGIN_ID
obsidian vault="VAULT" plugin:reload id=PLUGIN_ID
```

If the plugin still looks stale after reload, run `obsidian restart` and retry the health checks.

## 3. Full reinstall while preserving settings

Use this when build artifacts changed, runtime code looks stale, or the plugin directory itself may be corrupted.

```bash
VAULT_DIR="/absolute/path/to/vault"
PLUGIN_DIR="$VAULT_DIR/.obsidian/plugins/PLUGIN_ID"
TMP_DIR="$(mktemp -d)"

if [ -f "$PLUGIN_DIR/data.json" ]; then
  cp "$PLUGIN_DIR/data.json" "$TMP_DIR/data.json"
fi

obsidian vault="VAULT" plugin:disable id=PLUGIN_ID || true
rm -rf "$PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"
cp dist/main.js dist/manifest.json dist/styles.css dist/sql-wasm.wasm "$PLUGIN_DIR"/

if [ -f "$TMP_DIR/data.json" ]; then
  cp "$TMP_DIR/data.json" "$PLUGIN_DIR/data.json"
fi

date -u +"%Y-%m-%dT%H:%M:%SZ" > "$PLUGIN_DIR/.hotreload"
obsidian vault="VAULT" plugin:enable id=PLUGIN_ID
```

## 4. Manifest and runtime-state probes

Use small probes instead of one large eval:

```bash
obsidian vault="VAULT" eval code="JSON.stringify(app.plugins.plugins['PLUGIN_ID']?.manifest)"
obsidian vault="VAULT" eval code="(async()=>{const p=app.plugins.plugins['PLUGIN_ID']; return JSON.stringify({phase:p?.status_state ?? null, hasSource:Boolean(p?.source_collection), hasBlock:Boolean(p?.block_collection)});})()"
obsidian vault="VAULT" eval code="(async()=>{const p=app.plugins.plugins['PLUGIN_ID']; return JSON.stringify({sourceQueue:p?.source_collection?.save_queue?.length ?? null, blockQueue:p?.block_collection?.save_queue?.length ?? null});})()"
```

If one probe returns empty output, retry it alone before assuming a plugin failure.

## 5. Raw DB probe

```bash
obsidian vault="VAULT" eval code="(async()=>{const p=app.plugins.plugins['PLUGIN_ID']; const db=await p.source_collection.data_adapter.db(); return JSON.stringify(db.exec('SELECT COUNT(*) AS count FROM entities'));})()"
```

Use this before and after resets. If this fails, the plugin is not ready for release.

## 6. Timing-based profiling

Use direct timings for the operation you care about:

```bash
obsidian vault="VAULT" eval code="(async()=>{const p=app.plugins.plugins['PLUGIN_ID']; const t1=performance.now(); await p.source_collection.data_adapter.save(); const t2=performance.now(); await p.block_collection.data_adapter.save(); return JSON.stringify({sourceMs:Math.round(t2-t1), blockMs:Math.round(performance.now()-t2), sourceQueue:p.source_collection.save_queue.length, blockQueue:p.block_collection.save_queue.length, phase:p.status_state});})()"
```

You can swap the operation for initialization, import, or a specific plugin method.

## 7. CDP profiler

Use CDP profiler for one narrow operation only:

```bash
obsidian dev:cdp method=Profiler.enable params='{}'
obsidian dev:cdp method=Runtime.enable params='{}'
obsidian dev:cdp method=Profiler.start params='{}'
obsidian vault="VAULT" eval code="(async()=>{const p=app.plugins.plugins['PLUGIN_ID']; const t=performance.now(); await p.block_collection.data_adapter.save(); return JSON.stringify({blockMs:Math.round(performance.now()-t), blockQueue:p.block_collection.save_queue.length, phase:p.status_state});})()"
obsidian dev:cdp method=Profiler.stop params='{}'
```

Gotcha:

- `Profiler.stop` can return empty output or a payload too large to be useful inline. If that happens, trust the functional probe plus `performance.now()` timings and the error buffers.

## 8. Screenshot and DOM verification

Use screenshots when the user needs visual proof:

```bash
obsidian dev:screenshot path=/tmp/obsidian-plugin-check.png
```

Use DOM when you need deterministic text or state checks:

```bash
obsidian dev:dom selector=".workspace-leaf" text
obsidian dev:dom selector=".view-content" html
obsidian dev:css selector=".workspace-leaf" prop=background-color
```

Prefer DOM checks when validating a specific view state or error banner.

## 9. Post-autosave or post-timer verification

```bash
obsidian dev:errors clear
obsidian dev:console clear
sleep 35
obsidian dev:errors
obsidian dev:console level=warn limit=100
obsidian vault="VAULT" eval code="(async()=>{const p=app.plugins.plugins['PLUGIN_ID']; return JSON.stringify({phase:p?.status_state ?? null, sourceQueue:p?.source_collection?.save_queue?.length ?? null, blockQueue:p?.block_collection?.save_queue?.length ?? null});})()"
```

Use this for autosave, batch workers, debounce timers, or delayed persist logic.

## 10. Real-session gotchas

- `plugin:reload` can leave the in-memory manifest stale. Use `obsidian restart` if the loaded version is wrong.
- A restart can leave a community plugin disabled. Re-enable it and rerun the probes.
- A plugin may be fixed while the local DB is still malformed. Delete the DB file and recreate it instead of trusting the old state.
- A clean build and passing tests do not replace live runtime verification.
