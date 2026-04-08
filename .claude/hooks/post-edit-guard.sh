#!/usr/bin/env bash
# Post-edit guard: run lint + test for the affected plugin after source file edits.
# Called by Claude Code PostToolUse hook with the edited file path via stdin (JSON).
set -euo pipefail

WORKSPACE="/Users/beomsu/Documents/03. Area/obsidian-workspace"

# Read tool_input from stdin JSON to get file_path
FILE=$(cat | jq -r '.tool_input.file_path // .tool_input.command // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

# Only trigger for .ts source files
[[ "$FILE" != *.ts ]] && exit 0

# Skip test, config, script, and declaration files
[[ "$FILE" == *test* ]] && exit 0
[[ "$FILE" == *__tests__* ]] && exit 0
[[ "$FILE" == *.config.* ]] && exit 0
[[ "$FILE" == */scripts/* ]] && exit 0
[[ "$FILE" == *.d.ts ]] && exit 0

# Detect plugin directory from file path
REL="${FILE#$WORKSPACE/}"
PLUGIN_DIR="${REL%%/*}"

KNOWN_PLUGINS=(
  obsidian-boiler-template
  obsidian-eagle-plugin
  Metadata-Auto-Classifier
  obsidian-bible-search
  obsidian-qmd
  open-connections
  youtube-note-playlist
  agent-skill-deploy
)

FOUND=false
for p in "${KNOWN_PLUGINS[@]}"; do
  if [ "$p" = "$PLUGIN_DIR" ]; then
    FOUND=true
    break
  fi
done
$FOUND || exit 0

cd "$WORKSPACE/$PLUGIN_DIR" || exit 0

# Check node_modules exist
[ -d node_modules ] || exit 0

echo "=== Guard: lint + test for $PLUGIN_DIR ==="
LINT_RC=0
TEST_RC=0

pnpm lint 2>&1 || LINT_RC=$?
pnpm test 2>&1 || TEST_RC=$?

if [ $LINT_RC -ne 0 ] || [ $TEST_RC -ne 0 ]; then
  echo "=== GUARD FAILED: lint=$LINT_RC test=$TEST_RC ==="
  exit 1
fi

echo "=== Guard passed ==="
