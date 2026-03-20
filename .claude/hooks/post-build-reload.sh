#!/usr/bin/env bash
# PostToolUse hook: Reload plugin via Obsidian CLI after build
# Matcher: Bash

set -euo pipefail

INPUT=$(cat)
TOOL_INPUT=$(jq -r '.tool_input.command // empty' <<< "$INPUT" 2>/dev/null)

# Only trigger on build commands
[[ "$TOOL_INPUT" =~ (npm|pnpm)[[:space:]]+run[[:space:]]+build ]] || exit 0

# Detect which plugin dir is referenced in the build command
for dir in "$CLAUDE_PROJECT_DIR"/*/; do
  dirname=$(basename "$dir")
  if [[ "$TOOL_INPUT" == *"$dirname"* ]] && [ -f "$dir/manifest.json" ]; then
    PLUGIN_ID=$(jq -r '.id // empty' "$dir/manifest.json" 2>/dev/null)
    [ -n "$PLUGIN_ID" ] && obsidian plugin:reload id="$PLUGIN_ID" 2>/dev/null
    exit 0
  fi
done

exit 0
