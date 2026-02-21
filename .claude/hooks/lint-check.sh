#!/usr/bin/env bash
# PostToolUse hook: Run ESLint on files modified by Edit/Write tools
# Matcher: Edit|Write

set -euo pipefail

# Read tool use info from stdin
INPUT=$(cat)

# Extract the file path from the tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null)

# Exit silently if no file path found
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only lint TypeScript/JavaScript files
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

# Skip files outside the project
if [[ "$FILE_PATH" != "$CLAUDE_PROJECT_DIR"* ]]; then
  exit 0
fi

# Determine which plugin directory this file belongs to
PLUGIN_DIR=""
if [[ "$FILE_PATH" == *"/obsidian-eagle-plugin/"* ]]; then
  PLUGIN_DIR="$CLAUDE_PROJECT_DIR/obsidian-eagle-plugin"
elif [[ "$FILE_PATH" == *"/Metadata-Auto-Classifier/"* ]]; then
  PLUGIN_DIR="$CLAUDE_PROJECT_DIR/Metadata-Auto-Classifier"
elif [[ "$FILE_PATH" == *"/obsidian-smart-connections/"* ]]; then
  PLUGIN_DIR="$CLAUDE_PROJECT_DIR/obsidian-smart-connections"
fi

# Exit if not in a known plugin directory
if [ -z "$PLUGIN_DIR" ]; then
  exit 0
fi

# Check if eslint config exists in the plugin directory
HAS_ESLINT=false
for config in .eslintrc .eslintrc.js .eslintrc.json .eslintrc.yml .eslintrc.yaml eslint.config.js eslint.config.mjs eslint.config.ts; do
  if [ -f "$PLUGIN_DIR/$config" ]; then
    HAS_ESLINT=true
    break
  fi
done

# Also check package.json for eslintConfig
if [ "$HAS_ESLINT" = false ] && [ -f "$PLUGIN_DIR/package.json" ]; then
  if jq -e '.eslintConfig' "$PLUGIN_DIR/package.json" >/dev/null 2>&1; then
    HAS_ESLINT=true
  fi
fi

if [ "$HAS_ESLINT" = false ]; then
  exit 0
fi

# Run eslint on the specific file
cd "$PLUGIN_DIR"
npx eslint "$FILE_PATH" --no-error-on-unmatched-pattern 2>&1 || true
