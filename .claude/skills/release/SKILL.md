---
name: release
description: Create a consistent Obsidian plugin release following semantic versioning rules. Use when the user says "릴리즈해줘", "release this", or wants to publish a new version. Handles version bumping across package.json/manifest.json/versions.json, commit, tag, push, and CI handoff.
---

## Release Workflow

### 1. Detect CI

```bash
ls .github/workflows/
```

Read `release.yml` if it exists — note what triggers it, what files it packages, whether it calls `gh release create`. This determines Step 6.

### 2. Pre-flight

```bash
git status --short
grep '"version"' package.json manifest.json
tail -3 versions.json
gh release list --limit 3
```

Stop if versions are inconsistent.

### 3. Determine Version Bump

| Type | When |
|------|------|
| PATCH | Bug fixes, refactors, docs |
| MINOR | New features (backward compatible) |
| MAJOR | Breaking changes |

Tag format: bare number, no `v` prefix — `2.0.6` not `v2.0.6` (Obsidian convention).

### 4. Update Files

- `package.json` → bump `version`
- `manifest.json` → bump `version`
- `versions.json` → add `"X.Y.Z": "<minAppVersion>"`
- `CHANGELOG.md` → prepend new section (if file exists)

### 5. Validate, Commit, Tag, Push

```bash
pnpm run build && pnpm run test
git add package.json manifest.json versions.json CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
git push origin main
git tag X.Y.Z && git push origin X.Y.Z
```

Tag push triggers CI — CI handles build, package, and GitHub release creation. Done.

> **No CI detected (Step 1):** manually create the release after tag push.
> ```bash
> gh release create X.Y.Z main.js manifest.json --title "X.Y.Z" --generate-notes
> ```
