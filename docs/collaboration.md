# Collaboration

> Multi-agent collaboration protocol for the Obsidian plugin submodule workspace. Defines agent roles, ownership boundaries, and handoff rules.

## Start Here

New contributor or agent? Read in this order:

1. [Architecture](architecture.md) — understand the 4-layer structure
2. [Rules](rules.md) — know the mandatory code rules
3. This file — understand who does what and how handoffs work
4. [Exploration Guide](exploration-guide.md) — navigate the codebase

---

## Agent Team

| Agent | Role | Read | Write | Owns |
|-------|------|------|-------|------|
| `obsidian-developer` | Implementation — domain logic, infrastructure, wiring | all | `src/main.ts`, `src/domain/`, `src/types/`, `src/utils/`, `src/shared/`, `src/ui/embedding/`, `src/ui/models/`, `worker/`, `test/` | code |
| `obsidian-ui` | UX design + visual implementation | all | `src/ui/settings*.ts`, `src/ui/connections/`, `src/ui/lookup/`, `src/ui/views/`, `src/styles.css` | UI |
| `obsidian-qa` | Runtime verification + static code review | all | fixes where needed | quality |

## When to Use Which

| Task | Agents | Sequence |
|------|--------|----------|
| Feature implementation | developer (logic) + ui (visual) | Parallel, then qa to verify |
| Bug fix | developer | Then qa verifies |
| UI/UX work | ui | Then qa screenshots to verify |
| Code review | qa | Static checks + runtime verification |
| Planning | Main context | NOT a subagent task |

## Ownership Rules

1. **Respect boundaries**: Each agent only writes to files it owns (see table above)
2. **QA reads everything**: `obsidian-qa` has read access to all files but only writes fixes
3. **Shared files**: Changes to `src/shared/` must be coordinated — developer owns the code, but changes propagate to all plugins via boiler-template sync
4. **Types are shared**: `src/types/` is owned by developer but consumed by all layers

## Handoff Protocol

### Developer -> QA
- Developer completes implementation
- Developer runs `pnpm build` to verify compilation
- QA receives the changed file list and runs:
  - Static code review (architecture violations, obsidian API misuse)
  - Runtime verification via obsidian-cli (build, reload, smoke test)

### UI -> QA
- UI completes visual implementation
- QA takes screenshots to verify visual correctness
- QA checks accessibility and interaction patterns

### QA -> Developer (Bug Found)
- QA identifies the issue with file path and line number
- Developer fixes
- QA re-verifies

## Definition of Done

A task is complete when:

- [ ] Code compiles (`pnpm build` passes)
- [ ] Linter passes (`pnpm lint` passes)
- [ ] Tests pass (`pnpm test` passes, if tests exist)
- [ ] Architecture rules are satisfied (see [Rules](rules.md))
- [ ] Layer boundaries are respected (see [Architecture](architecture.md))
- [ ] No known gotchas violated (see [Gotchas](gotchas.md))
- [ ] QA has verified (for non-trivial changes)

## Communication Rules

- All messages should be in English
- When reporting bugs or issues, include file path and line number
- When proposing changes, reference the relevant docs/ file for context

## Plugin Development Philosophy

- `obsidian-boiler-template` is the **source of truth** for shared patterns
- When a new pattern is proven, establish it in boiler-template first, then propagate
- Never diverge individual plugins from boiler-template without a deliberate reason
- See [Architecture](architecture.md) for the full boiler-template workflow

---

## See Also

- [Architecture](architecture.md) — Layer structure, dependency rules
- [Exploration Guide](exploration-guide.md) — Study paths, grep patterns, feature→file mapping
- [Rules](rules.md) — Code enforcement (SRP, LOC limits, no catch-alls)
- [Patterns](patterns.md) — Proven implementation patterns
- [Gotchas](gotchas.md) — Known pitfalls and edge cases
- [Obsidian API](obsidian-api.md) — API quirks and workarounds
