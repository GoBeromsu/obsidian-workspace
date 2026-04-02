#!/bin/bash
set -euo pipefail
BOILER="${1:-/Users/beomsu/Documents/03. Area/obsidian-workspace/obsidian-boiler-template}"
MODE="${2:---dry-run}"

echo "=== Propagate ($MODE) ==="
node "$BOILER/scripts/sync-to-plugins.mjs" $MODE

if [[ "$MODE" != "--dry-run" && "$MODE" != "--check" ]]; then
  echo "=== Running CI ==="
  # Run CI on targets that have package.json
  for target in "$BOILER"/plugins/*/; do
    if [[ -f "$target/package.json" ]]; then
      echo "CI: $(basename "$target")"
      (cd "$target" && pnpm run ci 2>&1) || echo "CI FAILED: $(basename "$target")"
    fi
  done
fi
