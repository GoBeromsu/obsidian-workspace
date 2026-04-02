# Plugin Architecture

> The repeated internal contract every plugin in this submodule workspace should follow.

## Summary

Every production plugin keeps the same internal structure:

```
src/
├── main.ts
├── domain/
├── ui/
├── types/
├── utils/
└── shared/
```

This is the correct level of reuse for the workspace. `claude-code`-style subsystem sprawl should not be copied into plugins.

## Layer Contract

| Layer | Owns | Must not do |
|------|------|-------------|
| `main.ts` | composition root, registration, lifecycle wiring | business logic |
| `domain/` | pure business logic and state transitions | `obsidian` imports |
| `ui/` | Obsidian views, modals, settings, adapters | hidden business policy |
| `types/` | shared type surface | runtime behavior |
| `utils/` | pure helpers | app state or Obsidian APIs |
| `shared/` | deterministic code synced from boiler-template | plugin-specific logic |

## What We Borrow From `claude-code`

- explicit architecture docs
- discoverable entrypoints
- clear subsystem responsibility
- build/release as first-class engineering surfaces

## What We Do Not Borrow

- giant registries for commands/tools/features
- global runtime state patterns
- feature-flag matrices
- a single in-process platform architecture inside each plugin

## Workspace-Level Rule

Cross-plugin reuse must happen by:

1. deterministic shared code in `obsidian-boiler-template`
2. generated workflow/lint contracts
3. root control-plane metadata

It must **not** happen by direct plugin-to-plugin imports.

## Simplification Order

When a plugin starts looking like a platform:

1. remove pass-through wrappers
2. split oversized files
3. keep abstractions feature-local
4. only then consider promoting a pattern into the template

Current highest-risk simplification targets:

1. `open-connections`
2. `obsidian-qmd`
3. `Metadata-Auto-Classifier`

## See Also

- [architecture.md](architecture.md)
- [rules.md](rules.md)
- [workspace-topology.md](workspace-topology.md)
