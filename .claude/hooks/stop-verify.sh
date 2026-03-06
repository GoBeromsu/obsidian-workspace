#!/usr/bin/env bash
# Stop hook: Verify build and tests pass before Claude stops
# Blocks stop if build or test fails

set -euo pipefail

# Prevent infinite loops — if this hook triggers a stop, don't re-run
if [ "${STOP_HOOK_ACTIVE:-}" = "1" ]; then exit 0; fi
export STOP_HOOK_ACTIVE=1

cd "$CLAUDE_PROJECT_DIR"

# Find recently modified files to determine the active plugin
RECENT_FILE=$(git diff --name-only HEAD 2>/dev/null | head -1)
[ -z "$RECENT_FILE" ] && RECENT_FILE=$(git diff --cached --name-only 2>/dev/null | head -1)
[ -z "$RECENT_FILE" ] && exit 0

# Determine plugin directory
PLUGIN_DIR=""
for dir in obsidian-eagle-plugin Metadata-Auto-Classifier obsidian-smart-connections; do
  if [[ "$RECENT_FILE" == "$dir/"* ]]; then
    PLUGIN_DIR="$CLAUDE_PROJECT_DIR/$dir"
    break
  fi
done

[ -z "$PLUGIN_DIR" ] && exit 0

cd "$PLUGIN_DIR"

ERRORS=""

echo "Verifying build..."
if ! pnpm run build; then
  ERRORS="Build failed in $(basename "$PLUGIN_DIR")."
fi

echo "Verifying tests..."
if ! pnpm run test; then
  ERRORS="${ERRORS:+$ERRORS }Tests failed in $(basename "$PLUGIN_DIR")."
fi

if [ -n "$ERRORS" ]; then
  jq -n --arg r "$ERRORS Please fix before stopping." '{decision:"block",reason:$r}'
fi

exit 0
