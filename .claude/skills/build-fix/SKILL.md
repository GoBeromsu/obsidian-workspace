---
name: build-fix
description: Incrementally fix build errors one at a time. Use when a build fails, TypeScript or Python errors appear, or the user says "빌드 고쳐줘", "fix the errors", "build가 안 돼".
---

## Build Fix Workflow

```bash
pnpm run build
```

For each error (one at a time):
1. Show 5 lines of context around the error
2. Explain the root cause
3. Apply fix
4. Re-run build — verify error is gone

Stop if:
- Fix introduces new errors
- Same error persists after 3 attempts

Show summary when done: errors fixed / remaining / newly introduced.
