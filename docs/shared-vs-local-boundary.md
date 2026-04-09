# Shared vs Local Boundary

> Use this matrix to decide what belongs in the family contract and what must stay with each plugin.

## Boundary Matrix

| Surface | Default | Why |
|---|---|---|
| Architecture / design doc outline | Shared as template | Shared reading model, local content |
| Lint / type / boundary rules | Shared | Constraints without product coupling |
| Harness / runbook structure | Shared as parameterized template | Shared evidence model, local commands |
| Issue / PR / label / release-note contract | Shared | Governance is family-wide |
| CI / release skeleton | Shared with configuration | Common gates, local deploy semantics |
| Generic migration helpers | Exception-only | Only if runtime-agnostic |
| `src/**` implementation code | Local | Product/runtime/domain specific |
| Deployment implementation | Local | Asset layout and release flow differ |
| Repo-specific verify / e2e commands | Local | Runtime-specific execution details |

## Examples of Safe Sharing

### Good shared surface

- architecture doc section order
- “domain must not import `obsidian`” rule
- release note required sections
- smoke test evidence checklist
- label provisioning requirement for issue-form labels

### Bad shared surface

- Eagle-specific upload logic
- qmd process orchestration
- youtube audio-cache implementation
- bible-search modal workflow
- open-connections embedding runtime internals

## Examples of “Template, Not Copy”

These should be shared as patterns, not verbatim code or prose:

- architecture docs
- design docs
- runbooks
- verify script layout
- migration checklists

The family may share:

- headings
- required fields
- evidence expectations
- decision prompts

The family should not force:

- identical examples
- identical commands
- identical repo-specific prose

## Explicit Rule for `open-connections`

`open-connections` is reference-only.

That means:

- borrow its structure
- borrow its documentation discipline
- borrow its harness philosophy

But do not:

- plan migration work against it
- copy its implementation code into other repos
- force its deployment shape onto the family

## Exception Process

Something local may become shared only if all of these are true:

1. It is runtime-agnostic
2. It does not encode product-specific assumptions
3. It is useful across at least two repos
4. It can be parameterized cleanly
5. It is safer to centralize than to duplicate

If any of those fail, keep it local.

## Rule of Thumb

### Shared

“This tells many repos what quality or evidence looks like.”

### Local

“This tells one plugin how it actually works.”
