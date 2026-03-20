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
REL_PATH="${FILE_PATH#"$CLAUDE_PROJECT_DIR"/}"
PLUGIN_NAME="${REL_PATH%%/*}"
PLUGIN_DIR="$CLAUDE_PROJECT_DIR/$PLUGIN_NAME"

# Must be a real plugin directory with package.json
[ -f "$PLUGIN_DIR/package.json" ] || exit 0

# Check if eslint config exists (standalone file or embedded in package.json)
has_eslint_config() {
  local configs=(.eslintrc .eslintrc.js .eslintrc.json .eslintrc.yml .eslintrc.yaml eslint.config.js eslint.config.mjs eslint.config.ts)
  for config in "${configs[@]}"; do
    [ -f "$PLUGIN_DIR/$config" ] && return 0
  done
  jq -e '.eslintConfig' "$PLUGIN_DIR/package.json" >/dev/null 2>&1
}

has_eslint_config || exit 0

# Run eslint on the specific file using local binary
cd "$PLUGIN_DIR"
pnpm exec eslint "$FILE_PATH" --no-error-on-unmatched-pattern 2>&1 || true
