#!/usr/bin/env bash
# Stop hook: Verify build and tests pass before Claude stops
# Blocks stop if build or test fails

set -euo pipefail

cd "$CLAUDE_PROJECT_DIR"

# Collect unique top-level dirs from changed files (unstaged + staged)
CHANGED_DIRS=$(git diff --name-only HEAD 2>/dev/null | sed 's|/.*||' | sort -u)
[ -z "$CHANGED_DIRS" ] && exit 0

ERRORS=()

for PLUGIN_NAME in $CHANGED_DIRS; do
  PLUGIN_DIR="$CLAUDE_PROJECT_DIR/$PLUGIN_NAME"
  [ -f "$PLUGIN_DIR/manifest.json" ] || continue

  PKG="$PLUGIN_DIR/package.json"

  if jq -e '.scripts.build' "$PKG" >/dev/null 2>&1; then
    echo "Verifying build in $PLUGIN_NAME..."
    pnpm run -C "$PLUGIN_DIR" build || ERRORS+=("Build failed in $PLUGIN_NAME.")
  fi

  if jq -e '.scripts.test' "$PKG" >/dev/null 2>&1; then
    echo "Verifying tests in $PLUGIN_NAME..."
    pnpm run -C "$PLUGIN_DIR" test || ERRORS+=("Tests failed in $PLUGIN_NAME.")
  fi
done

if [ ${#ERRORS[@]} -gt 0 ]; then
  MSG="${ERRORS[*]} Please fix before stopping."
  jq -n --arg r "$MSG" '{decision:"block",reason:$r}'
fi

exit 0
