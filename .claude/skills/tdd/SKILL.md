---
name: tdd
description: Enforce test-driven development workflow. Scaffold interfaces, generate tests FIRST, then implement minimal code to pass. Use when the user wants to implement a new feature, function, or bug fix using TDD, or says "TDD로 짜줘", "테스트 먼저 써줘".
---

## TDD Workflow

**Cycle: RED → GREEN → REFACTOR → REPEAT**

### 1. Define Interface

Write the type/interface and a stub that throws `Error('Not implemented')`.

### 2. Write Failing Tests (RED)

```bash
pnpm run test   # must FAIL before implementing
```

Cover: happy path, edge cases (empty/null/boundary), error conditions.

### 3. Implement Minimal Code (GREEN)

Write the least code that makes tests pass. No more.

```bash
pnpm run test   # must PASS
```

### 4. Refactor

Improve structure while keeping tests green.

```bash
pnpm run test   # still PASS
```

### 5. Check Coverage

```bash
pnpm run test:coverage
```

Target: 80%+ overall. Never skip RED — tests must fail before any implementation.
