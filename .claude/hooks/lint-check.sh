#!/usr/bin/env bash
# PostToolUse hook: Run ESLint on files modified by Edit/Write tools
# Matcher: Edit|Write

set -euo pipefail

INPUT=$(cat)

# Extract the file path from the tool input
FILE_PATH=$(jq -r '.tool_input.file_path // .tool_input.filePath // empty' <<< "$INPUT" 2>/dev/null)

# Exit silently if no file path found
[ -z "$FILE_PATH" ] && exit 0

# Only lint TypeScript/JavaScript files
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

# Skip files outside the project
[[ "$FILE_PATH" != "$CLAUDE_PROJECT_DIR/"* ]] && exit 0

# Determine which plugin directory this file belongs to
PLUGIN_DIR=""
for dir in obsidian-eagle-plugin Metadata-Auto-Classifier obsidian-smart-connections; do
  if [[ "$FILE_PATH" == *"/$dir/"* ]]; then
    PLUGIN_DIR="$CLAUDE_PROJECT_DIR/$dir"
    break
  fi
done

[ -z "$PLUGIN_DIR" ] && exit 0

# Check if eslint config exists in the plugin directory
HAS_ESLINT=false
for config in .eslintrc .eslintrc.js .eslintrc.json .eslintrc.yml .eslintrc.yaml eslint.config.js eslint.config.mjs eslint.config.ts; do
  if [ -f "$PLUGIN_DIR/$config" ]; then
    HAS_ESLINT=true
    break
  fi
done

if [ "$HAS_ESLINT" = false ] && [ -f "$PLUGIN_DIR/package.json" ]; then
  jq -e '.eslintConfig' "$PLUGIN_DIR/package.json" >/dev/null 2>&1 && HAS_ESLINT=true
fi

[ "$HAS_ESLINT" = false ] && exit 0

# Run eslint on the specific file using local binary
cd "$PLUGIN_DIR"
pnpm exec eslint "$FILE_PATH" --no-error-on-unmatched-pattern 2>&1 || true
