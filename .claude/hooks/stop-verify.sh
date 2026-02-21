#!/usr/bin/env bash
# Stop hook: Verify build and tests pass before Claude stops
# Blocks stop if build or test fails

set -uo pipefail

# Prevent infinite loops — if this hook triggers a stop, don't re-run
if [ "${STOP_HOOK_ACTIVE:-}" = "1" ]; then
  exit 0
fi
export STOP_HOOK_ACTIVE=1

# Read stop event from stdin
INPUT=$(cat)

# Determine which plugin was being worked on by checking recent git changes
cd "$CLAUDE_PROJECT_DIR"

# Find recently modified .ts/.js files to determine the active plugin
RECENT_FILE=$(git diff --name-only HEAD 2>/dev/null | head -1)
if [ -z "$RECENT_FILE" ]; then
  RECENT_FILE=$(git diff --cached --name-only 2>/dev/null | head -1)
fi
if [ -z "$RECENT_FILE" ]; then
  # No changes to verify
  exit 0
fi

# Determine plugin directory
PLUGIN_DIR=""
BUILD_CMD=""
TEST_CMD=""

if [[ "$RECENT_FILE" == obsidian-eagle-plugin/* ]]; then
  PLUGIN_DIR="$CLAUDE_PROJECT_DIR/obsidian-eagle-plugin"
  BUILD_CMD="pnpm run build"
  TEST_CMD="pnpm run test"
elif [[ "$RECENT_FILE" == Metadata-Auto-Classifier/* ]]; then
  PLUGIN_DIR="$CLAUDE_PROJECT_DIR/Metadata-Auto-Classifier"
  BUILD_CMD="pnpm run build"
  TEST_CMD="pnpm run test"
elif [[ "$RECENT_FILE" == obsidian-smart-connections/* ]]; then
  PLUGIN_DIR="$CLAUDE_PROJECT_DIR/obsidian-smart-connections"
  BUILD_CMD="pnpm run build"
  TEST_CMD="pnpm run test"
fi

if [ -z "$PLUGIN_DIR" ]; then
  exit 0
fi

cd "$PLUGIN_DIR"

ERRORS=""

# Run build
echo "🔨 Verifying build..."
if ! $BUILD_CMD 2>&1; then
  ERRORS="Build failed in $(basename "$PLUGIN_DIR")."
fi

# Run tests
echo "🧪 Verifying tests..."
if ! $TEST_CMD 2>&1; then
  if [ -n "$ERRORS" ]; then
    ERRORS="$ERRORS Tests also failed."
  else
    ERRORS="Tests failed in $(basename "$PLUGIN_DIR")."
  fi
fi

# If there were errors, block the stop
if [ -n "$ERRORS" ]; then
  echo "{\"decision\": \"block\", \"reason\": \"$ERRORS Please fix before stopping.\"}"
  exit 0
fi

echo "Build and tests passed."
exit 0
