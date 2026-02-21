# Team Architecture — Obsidian Plugin Dev

## Philosophy

Task-driven spawn: the Opus lead decides which roles to spawn per task. No fixed team — roles are created on demand based on what the work requires.

## Available Roles

| Role | Agent Name | Model | When to Spawn |
|------|-----------|-------|---------------|
| Planner | `planner` | opus | Complex features, refactoring, multi-wave tasks |
| Obsidian Researcher | `obsidian-researcher` | sonnet | API exploration, pattern investigation, node_modules diving |
| TypeScript Developer | `ts-developer` | sonnet | Feature implementation, bug fixes, refactoring |
| Tester | `tester` | sonnet | Unit/integration tests, CDP E2E verification, plugin health |
| Code Reviewer | `code-reviewer` | sonnet | Post-change quality and security review |
| Frontend Specialist | `frontend-specialist` | opus | React/TypeScript UI code, performance optimization |
| UX/UI Specialist | `ux-ui-specialist` | opus | Design analysis, wireframes, accessibility, UX audits |

## Task → Role Mapping

| Task Type | Roles to Spawn |
|-----------|---------------|
| Bug fix | ts-developer + tester |
| New feature | planner + ts-developer + tester + code-reviewer |
| API investigation | obsidian-researcher |
| Refactoring | planner + ts-developer + code-reviewer |
| Runtime debugging | tester (CDP probing) |
| Plugin verification | tester (E2E checks) |

## File Ownership (Advisory)

One agent per module at a time. Lead coordinates to prevent overlap.

| Module | Primary Owner | Secondary |
|--------|--------------|-----------|
| `.claude/` | Lead only | — |
| Eagle: `src/EaglePlugin.ts` | Lead only | — |
| Eagle: `src/uploader/` | ts-developer | tester |
| Eagle: `src/ui/` | frontend-specialist | ts-developer |
| MAC: `src/main.ts` | Lead only | — |
| MAC: `src/provider/` | ts-developer | tester |
| MAC: `src/classifier/` | ts-developer | tester |
| MAC: `src/settings/` | frontend-specialist | ts-developer |
| MAC: `src/lib/` | ts-developer | — |
| SC: `src/` | ts-developer | tester |
| SC: `src/views/` | frontend-specialist | ts-developer |
| SC: `src/components/` | frontend-specialist | — |

## Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| Post-build check | Bash command (build) | CDP hot-reload verification |
| ESLint check | Edit/Write on .ts/.js | Lint the modified file |
| Stop verify | Claude stops | Build + test must pass |

## Coordination Rules

1. Lead assigns file ownership before spawning agents
2. Agents only modify files in their ownership
3. If an agent needs changes in another's files → message the lead
4. Build + verify between waves before proceeding
5. All agents can read any file; only write to owned files
