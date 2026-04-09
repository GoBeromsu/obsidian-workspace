# Family Shared Contract

> The workspace shares contracts, docs, and harnesses first. It does not share product implementation by default.

## Purpose

This document defines the default sharing boundary for the Obsidian plugin family in this workspace.

The goal is:

- consistent engineering quality across plugins
- shared architectural language
- shared governance and verification expectations
- preserved implementation diversity per plugin

## Hard Constraints

### 1. `open-connections` is reference-only

`open-connections` is currently active work and must not be treated as a migration target.

Use it as:

- an architecture reference
- a harness/runbook reference
- a documentation reference

Do not use it as:

- a target for workspace-wide cleanup changes
- a shared code donor by default
- a deployment baseline to copy

### 2. Shared boiler-template scope must stay narrow

`obsidian-boiler-template` may distribute:

- governance contracts
- documentation schemas
- lint/type/boundary rules
- harness skeletons
- CI/release contracts

It must not grow into a default distributor of product implementation code.

## Share-by-Default Surfaces

These surfaces are safe default candidates for workspace sharing.

### Architecture and design doc schemas

Share:

- section outline
- required questions
- dependency/boundary checklist
- unsafe-edge checklist
- verification entrypoints checklist

Do not share:

- repo-specific prose
- product-specific runtime assumptions

### Lint, type, and boundary contracts

Share:

- layer boundaries
- `obsidian` import restrictions
- type-safety floor
- parse-at-the-edge expectations
- explicit unsafe-edge rules

These are high-leverage because they constrain behavior without forcing shared product code.

### Harness and runbook templates

Share:

- evidence categories
- smoke-check structure
- runbook sections
- verification expectations
- artifact expectations

Do not share:

- plugin-specific shell commands
- selectors
- binary resolution details
- service-specific runtime steps

### CI and release contracts

Share:

- version/manifest parity checks
- release-note structure requirements
- minimum CI gates
- issue/PR governance expectations
- label provisioning expectations for labels referenced by issue forms

Do not assume:

- one deploy mode
- one artifact layout
- one release asset path

## Local-by-Default Surfaces

These surfaces stay repo-local unless explicitly justified with cross-repo evidence.

### Product implementation code

Examples:

- `src/domain/**`
- `src/ui/**`
- runtime adapters
- API integrations
- cache/storage internals

Reason:

Each plugin integrates with a different runtime, domain, and product workflow.

### Deployment-line implementation

Examples:

- deploy mode
- release asset layout
- `dist/` vs root outputs
- packaging quirks

Reason:

The family already uses materially different release and asset strategies.

### Repo-specific runtime and verify commands

Examples:

- plugin-specific `verify`
- repo-local e2e commands
- service-specific smoke commands

Reason:

The harness category can be shared, but the concrete command line usually cannot.

## Decision Rule

Use this rule before sharing anything:

### Share it when

It constrains many repos without embedding repo-specific runtime assumptions.

Examples:

- doc schema
- lint rule
- type policy
- release-note contract
- evidence checklist

### Keep it local when

It contains any of:

- plugin IDs
- external API assumptions
- selectors
- binary resolution
- storage layout
- release asset paths
- repo-specific runtime commands

### Exception-only sharing

If a shared module is truly runtime-agnostic and already proven across multiple repos, it may remain shared as an explicit exception.

New shared implementation code is frozen by default unless separately justified.

## Workspace Direction

The workspace should evolve toward:

- **shared contract**
- **shared harness**
- **shared docs**
- **repo-local implementation**

This is a harness-engineering posture, not a shared-product-code posture.

## Review Questions

Before adding anything new to the shared surface, ask:

1. Does this encode a contract or actual product behavior?
2. Would copying this flatten meaningful repo differences?
3. Can this be expressed as a template, schema, or evidence rule instead?
4. Would a repo-local exception be healthier than centralizing it?

If the answer to 1 is “product behavior,” default to repo-local.
