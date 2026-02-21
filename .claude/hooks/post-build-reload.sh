#!/usr/bin/env bash
# Post-build hook: reload plugin via Obsidian CLI
# Triggered by PostToolUse Bash hook after `pnpm run build` / `npm run build`

INPUT=$(cat)
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only trigger on build commands
if ! echo "$TOOL_INPUT" | grep -qE '(npm|pnpm)\s+run\s+build'; then
  exit 0
fi

# Determine plugin directory from build command context
cd "$CLAUDE_PROJECT_DIR"
for dir in obsidian-eagle-plugin Metadata-Auto-Classifier obsidian-smart-connections; do
  if echo "$TOOL_INPUT" | grep -q "$dir"; then
    PLUGIN_ID=$(jq -r '.id' "$dir/manifest.json" 2>/dev/null)
    [ -n "$PLUGIN_ID" ] && obsidian plugin:reload id="$PLUGIN_ID" 2>/dev/null
    exit 0
  fi
done
exit 0
