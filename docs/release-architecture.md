# Release Architecture

> How release quality should work across a federated plugin workspace.

## Summary

Release authority stays in child plugin repos. Release quality moves to the root control plane.

That means:

- child repos still create tags and GitHub Releases
- root validates whether a ref is ready to be released
- `obsidian-boiler-template` defines shared release contracts

## Current Model

Today the workspace has:

- shared release scripts and workflow templates in `obsidian-boiler-template`
- copied/generated workflow files in child repos
- per-plugin release ownership
- no single report that says which plugins are releasable right now

This is centralized policy with federated execution, but copied workflow logic creates drift risk.

## Target Model

Move toward:

1. shared release contract in `obsidian-boiler-template`
2. root release-readiness gate
3. reusable workflows instead of copied workflow YAML
4. child repo release publication after root gate approval

## Release Quality Inputs

A plugin should not be treated as releasable unless all of these exist:

- latest child CI is green
- version, tag, and manifest are consistent
- required artifacts exist
- runtime smoke evidence exists
- structured release notes exist

## Root Gate

The root gate is report-only first. It reads `workspace/plugins.manifest.json` and emits:

- per-plugin readiness status
- missing evidence
- latest CI/release links where available
- policy violations such as root-local releaseable plugins

Later it can become blocking.

## Reusable Workflow Direction

Do not keep copied CI/release YAML forever.

Instead:

- child repos pass inputs
- reusable workflows run shared logic
- the template remains the source of truth
- local developer scripts remain local only where local UX needs them

## Boiler Template Special Case

`obsidian-boiler-template` is both:

- a releaseable repo
- the source of truth for shared contracts

Its release path should remain stricter than the others:

- sync health must be visible
- release drift must be reported
- template-only failures should not silently block unrelated plugin releases without explanation

## See Also

- [release-note-contract.md](release-note-contract.md)
- [workspace-topology.md](workspace-topology.md)
- [workspace-catalog.md](workspace-catalog.md)
