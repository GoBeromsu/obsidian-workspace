---
name: no-gh-release
enabled: true
event: bash
action: block
pattern: ^gh\s+release\b
---

Releases must go through the CI pipeline. Do not create GitHub releases manually.
