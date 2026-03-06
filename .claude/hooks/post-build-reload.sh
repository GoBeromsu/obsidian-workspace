#!/usr/bin/env bash
# PostToolUse hook: Reload plugin via Obsidian CLI after build
# Matcher: Bash

set -euo pipefail

INPUT=$(cat)
TOOL_INPUT=$(jq -r '.tool_input.command // empty' <<< "$INPUT" 2>/dev/null)

# Only trigger on build commands
[[ "$TOOL_INPUT" =~ (npm|pnpm)[[:space:]]+run[[:space:]]+build ]] || exit 0

cd "$CLAUDE_PROJECT_DIR"

for dir in obsidian-eagle-plugin Metadata-Auto-Classifier obsidian-smart-connections; do
  if [[ "$TOOL_INPUT" == *"$dir"* ]]; then
    PLUGIN_ID=$(jq -r '.id' "$dir/manifest.json" 2>/dev/null)
    [ -n "$PLUGIN_ID" ] && obsidian plugin:reload id="$PLUGIN_ID" 2>/dev/null
    exit 0
  fi
done

exit 0
