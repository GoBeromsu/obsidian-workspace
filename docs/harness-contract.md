# Harness Contract

> The family shares proof expectations, not identical runtime commands.

## Purpose

A plugin family should not need identical implementation to prove quality consistently.

This contract defines the minimum shared verification shape for plugins in this workspace.

## Core Idea

Share:

- what must be proven
- what evidence must exist
- what categories of checks are required

Do not share by default:

- the exact commands
- runtime-specific setup
- service-specific selectors
- deployment-specific scripts

## Minimum Evidence Categories

Each plugin should expose evidence for these categories.

### 1. Static correctness

At minimum, define and run the plugin’s static quality gates:

- build
- lint
- typecheck

The exact command may differ by repo.

### 2. Runtime smoke proof

Each plugin should have at least one repo-legible runtime verification path.

Examples:

- smoke script
- verify script
- test vault check
- e2e-lite flow

What matters is that the repo explains how runtime confidence is established.

### 3. Release proof

Every release should have:

- version / manifest parity
- release note structure
- verification evidence
- compatibility / risk statement

See also: [Release Note Contract](release-note-contract.md)

### 4. Operational runbook

Each non-trivial plugin should have a runbook or verification guide that answers:

1. What should be checked?
2. What evidence should be captured?
3. What are common failure buckets?
4. What should be reported back to users or maintainers?

## Shared Harness Surfaces

These are safe to centralize.

### Shared

- harness doc schema
- smoke evidence checklist
- artifact naming expectations
- runbook section template
- CI/release gate policy

### Shared only as skeleton

- dev script skeletons
- release script skeletons
- verify script scaffolding

Skeleton means:

- shape and required stages may be reused
- repo-specific runtime commands remain local

## Local Harness Surfaces

These stay local by default.

- plugin-specific binary resolution
- product-specific selectors
- external service credentials flow
- repo-specific runtime command sequences
- deployment-line command details

## Minimum Review Questions

Before considering a plugin “aligned,” reviewers should be able to answer:

1. What are this plugin’s required quality gates?
2. Where is its runtime smoke proof?
3. What evidence should be captured before release?
4. What remains plugin-specific and intentionally local?

## Family Alignment Target

The alignment target is:

- comparable confidence
- comparable evidence
- comparable readability

It is **not**:

- identical scripts
- identical runtime flows
- identical implementation code

## Short Checklist

For each plugin, verify:

- [ ] architecture / design entry doc exists
- [ ] lint / type / boundary contract is applied
- [ ] runtime smoke path exists
- [ ] release-note contract is enforced
- [ ] labels referenced by issue forms actually exist
- [ ] repo-specific verify and deploy details are documented, not centralized blindly
