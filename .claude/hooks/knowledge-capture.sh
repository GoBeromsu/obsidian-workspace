#!/usr/bin/env bash
# Stop hook: Remind Claude to capture new learnings before ending a session
# Lightweight — just outputs a reminder message. The actual analysis is done by Claude.

set -euo pipefail

cat "$CLAUDE_PROJECT_DIR"/.claude/hooks/knowledge-capture-reminder.md

exit 0
