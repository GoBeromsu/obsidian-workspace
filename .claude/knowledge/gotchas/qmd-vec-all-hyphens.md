---
type: gotcha
date: 2026-03-20
plugin: obsidian-qmd
tags: [qmd, vec, negation, hyphens, dates]
confidence: high
---

# QMD Rejects ALL Hyphens in vec/hyde Queries (Not Just -word)

## Context
Previous fix only stripped `-` before letters. But dates like `2026-03-13` have `-13` which QMD also treats as negation.

## Discovery
QMD's query parser treats ANY `-` followed by any word character (including digits) as negation in vec/hyde lines. `2026-03-13` → `-03` and `-13` are both interpreted as negation operators.

## Solution
Replace ALL hyphens with spaces in vec/hyde lines: `value.replace(/-/g, ' ')`. This is safe because vec/hyde are semantic embedding queries — hyphens don't affect meaning.

Lex lines can keep hyphens (lex supports negation intentionally).

## References
- File: `src/qmd/query-builder.ts` sanitizeForVec()
