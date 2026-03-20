---
type: gotcha
date: 2026-03-20
plugin: all
tags: [eslint, no-console, config, ci]
confidence: high
---

# no-console must be scoped to src/**/*.ts only

## Context
Configuring ESLint for Obsidian plugins where `console.log` should be forbidden in production source code but allowed in build scripts, test files, and config files.

## Discovery
Applying the `no-console` rule globally causes CI failures because build scripts (`esbuild.config.mjs`, `scripts/*.mjs`) and test files legitimately use `console.log`. The rule must be scoped to only the plugin source directory.

## Solution
In `eslint.config.mjs`, scope the rule using the `files` property:

```javascript
{
  files: ['src/**/*.ts'],
  rules: {
    'no-console': 'error',
  },
}
```

Do not apply `no-console` at the top level or it will break:
- `esbuild.config.mjs`
- `scripts/release.mjs`
- `scripts/release-notes.mjs`
- Test files (`__tests__/**/*.ts`)

## References
- ESLint flat config `files` scoping: https://eslint.org/docs/latest/use/configure/configuration-files#specifying-files-and-ignores
