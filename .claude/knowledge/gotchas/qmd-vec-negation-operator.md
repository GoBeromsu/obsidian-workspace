---
type: gotcha
date: 2026-03-20
plugin: obsidian-qmd
tags: [qmd, search, vec, hyde, negation]
confidence: high
---

# QMD vec/hyde lines reject -term negation patterns

## Context
Writing advanced search queries using QMD's multi-line query syntax with `vec` (vector) or `hyde` (hypothetical document) sub-queries.

## Discovery
QMD's `vec` and `hyde` query types do not support the `-term` negation operator. Negation only works with `lex` (BM25 keyword) queries. If you include `-term` in a vec/hyde query, it is either ignored or causes unexpected behavior.

## Solution
Structure multi-line queries so that negation is only applied in `lex` sub-queries:

```
lex: error handling -deprecated
vec: how to handle errors gracefully in Obsidian plugins
```

Do not write:
```
vec: error handling -deprecated    ← negation ignored/broken
```

## References
- QMD search documentation and MCP tool instructions
