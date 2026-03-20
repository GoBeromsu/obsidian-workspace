---
type: pattern
date: 2026-03-20
plugin: all
tags: [notice, ux, anti-pattern]
confidence: high
---

# Do NOT Show Update-Available Notices

## Context
Open Connections had a `checkForUpdate()` function that polled GitHub API every interval and showed a "Update available (vX.Y.Z)" notice.

## Discovery
This interrupts user focus — a bad UX pattern. Users are deep in writing/thinking when the notice pops up.

## Solution
- Remove all update-check polling (setTimeout/setInterval)
- Remove `update_available` from notice catalog
- Users get updates via BRAT or manual check in settings
- Never interrupt the user's workflow with non-critical notifications

## Apply to All Plugins
No plugin should show unsolicited update notices. This is a boiler-template anti-pattern rule.
