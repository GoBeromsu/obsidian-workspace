---
name: commit
description: Create a git commit with staged or unstaged changes. Use when the user says "커밋해줘", "commit this", finishes a task and needs changes committed, or asks to save progress. Writes a Conventional Commits message based on the diff.
---

## Commit Workflow

```bash
git status
git diff HEAD
git branch --show-current
git log --oneline -5
```

Stage relevant files and create a single commit. Use Conventional Commits format:
```
<type>(<scope>): <description>

```

Types: `feat` | `fix` | `refactor` | `chore` | `docs` | `test` | `build` | `ci`

Do not stage: `.env`, secrets, build artifacts (`main.js`, `dist/`).
