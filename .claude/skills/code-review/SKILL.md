---
name: code-review
description: Security and quality review of uncommitted changes. Use when the user says "코드 리뷰해줘", "review this", or before committing significant changes. Checks for security vulnerabilities, code quality issues, and best practices.
---

## Code Review Workflow

```bash
git diff --name-only HEAD
```

Review each changed file for:

**CRITICAL — block commit:**
- Hardcoded credentials, API keys, tokens
- SQL injection, XSS vulnerabilities
- Missing input validation at system boundaries
- Path traversal risks

**HIGH — strongly recommend fix:**
- Functions > 50 lines, files > 800 lines
- Nesting depth > 4 levels
- Missing error handling
- `console.log` left in production paths
- No tests for new logic

**MEDIUM — flag but don't block:**
- Mutation where immutable patterns are preferred
- Missing JSDoc for public APIs
- Accessibility issues (a11y)

Report format: severity · file:line · issue · suggested fix.
