# Release Note Contract

> Release notes must explain why a release exists, not just that one happened.

## Rule

The fallback body `Automated release for X.Y.Z` is not an acceptable normal release note.

It may exist only as an explicit emergency override.

## Required Sections

Every plugin release should contain:

1. `## Why this release exists`
2. `## User-visible changes`
3. `## Verification`
4. `## Risks / compatibility`

## Minimum Example

```md
# Release 1.2.3

## Why this release exists
- Fixes stale lookup results after model-switch operations.

## User-visible changes
- Lookup view updates immediately after switching embedding model.

## Verification
- `pnpm run ci`
- Obsidian reload
- `dev:errors` clean
- lookup screenshot captured in `Test` vault

## Risks / compatibility
- No data migration.
- Existing settings remain compatible.
```

## Preferred Authoring Model

Do not write giant hand-edited release bodies at publish time.

Preferred path:

- keep release fragments under a plugin-local folder such as:
  - `releases/fragments/`
  - or `.changes/`
- merge them into the final release body during release generation

## Gate Behavior

The release gate should fail when:

- no structured release content exists
- required sections are missing
- verification is vague or absent

The release gate may allow an emergency override only when the release explicitly declares itself as emergency/fallback.

## Review Questions

Before publishing, reviewers should be able to answer:

1. What changed for users?
2. Why now?
3. What evidence says it works?
4. What could still go wrong?
