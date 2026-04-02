# Workspace Topology

> How `obsidian-workspace` is structured as a submodule workspace and control plane.

## Summary

`obsidian-workspace` is a **submodule workspace**, not a package monorepo.

- Each production plugin lives in its own git repository.
- The root repository coordinates portfolio state, shared contracts, and release readiness.
- `obsidian-boiler-template` is the source of truth for deterministic shared code, lint/workflow contracts, and scaffolding.
- `agent-skill-deploy` is now an independent submodule member. The old root-local `obsidian-skill-deploy` exception is retired.

## Topology

| Layer | Purpose | Examples |
|------|---------|----------|
| Root control plane | Portfolio visibility, docs, release readiness, submodule pointers | `README.md`, `workspace/plugins.manifest.json`, root workflows |
| Template platform | Shared deterministic code and generated contracts | `obsidian-boiler-template/` |
| Plugin repos | Independent implementation and release authority | `open-connections/`, `obsidian-qmd/`, `obsidian-eagle-plugin/` |
| Incubators | Experimental plugins not yet treated as stable portfolio members | `agent-skill-deploy/` |

## Source Of Truth Boundaries

- Root repo owns:
  - portfolio manifest
  - release-readiness reports
  - workspace-level docs
  - approved submodule revisions
- `obsidian-boiler-template` owns:
  - shared deterministic modules
  - lint and workflow contracts
  - generated scaffold inputs
- Child plugin repos own:
  - plugin implementation
  - runtime behavior
  - final GitHub Releases

## Control Plane Responsibilities

The root control plane should answer:

1. Which plugins are portfolio members?
2. Which refs are approved?
3. Which plugins are releasable right now, and why?
4. Which plugins are blocked, and by which missing evidence?

The root control plane should **not**:

- centralize plugin domain logic
- act as the only publisher
- blur plugin runtime boundaries

## Promotion Path

`agent-skill-deploy` has already completed the repo promotion step and now remains incubator-classified until its release and smoke contracts are fully aligned.

1. Root-local incubator
2. Independent repo as `agent-skill-deploy`
3. Added to `.gitmodules` and `workspace/plugins.manifest.json`
4. Graduated from incubator once CI/release/smoke contracts match stable plugins

## See Also

- [plugin-architecture.md](plugin-architecture.md)
- [release-architecture.md](release-architecture.md)
- [release-note-contract.md](release-note-contract.md)
- [workspace-catalog.md](workspace-catalog.md)
