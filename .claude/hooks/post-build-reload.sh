#!/usr/bin/env bash
# PostToolUse hook: Deploy to Test vault + reload after build
# Matcher: Bash

set -euo pipefail

INPUT=$(cat)
TOOL_INPUT=$(jq -r '.tool_input.command // empty' <<< "$INPUT" 2>/dev/null)

[[ "$TOOL_INPUT" =~ (npm|pnpm)[[:space:]]+run[[:space:]]+(build|ci) ]] || exit 0

# Find plugin dir: match by name in command, or by recently built dist/
PLUGIN_DIR=""
for dir in "$CLAUDE_PROJECT_DIR"/*/; do
  [ -f "$dir/manifest.json" ] || continue
  if [[ "$TOOL_INPUT" == *"$(basename "$dir")"* ]]; then
    PLUGIN_DIR="$dir"; break
  fi
  if [ -z "$PLUGIN_DIR" ] && [ -f "$dir/dist/main.js" ] &&
     find "$dir/dist/main.js" -newermt '30 seconds ago' -print -quit 2>/dev/null | grep -q .; then
    PLUGIN_DIR="$dir"
  fi
done

[ -z "$PLUGIN_DIR" ] && exit 0

PLUGIN_ID=$(jq -r '.id // empty' "$PLUGIN_DIR/manifest.json" 2>/dev/null)
[ -z "$PLUGIN_ID" ] && exit 0

# Deploy to Test vault (folder name must match plugin ID)
if [ -n "${OBSIDIAN_VAULT_PATH:-}" ] && [ -d "$PLUGIN_DIR/dist" ]; then
  DEST="$OBSIDIAN_VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"
  if [ -d "$DEST" ]; then
    cp "$PLUGIN_DIR/dist/main.js" "$PLUGIN_DIR/dist/manifest.json" "$DEST/" 2>/dev/null || true
    cp "$PLUGIN_DIR/dist/styles.css" "$DEST/" 2>/dev/null || true
    for f in "$PLUGIN_DIR/dist/"*.js "$PLUGIN_DIR/dist/"*.wasm; do
      [ -f "$f" ] && [ "$(basename "$f")" != "main.js" ] && cp "$f" "$DEST/" 2>/dev/null || true
    done
    echo "[hook] Deployed to Test vault: $DEST"
  fi
fi

obsidian plugin:reload id="$PLUGIN_ID" 2>/dev/null || true
