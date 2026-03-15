---
name: no-git-tag
enabled: true
event: bash
action: block
pattern: ^git\s+tag\b
---

Tags must be created through the CI pipeline. Do not create git tags manually.
