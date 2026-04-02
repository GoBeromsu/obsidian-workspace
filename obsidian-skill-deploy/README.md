# Skill Deploy

Deploy AI agent skills from your Obsidian vault to remote GitHub repositories, with automatic per-provider frontmatter transformation.

Write skills once in your vault using a canonical format, then deploy them to Claude Code, Codex, Gemini, and Cursor repositories — each receiving correctly transformed frontmatter.

## Features

- **Multi-provider deploy** — Claude Code, Codex, Gemini, Cursor out of the box
- **Frontmatter transformation** — Canonical vault format auto-converts to each provider's expected schema
- **GitHub OAuth (PKCE)** — Secure device-flow authentication, no tokens to copy-paste
- **Incremental deploy** — Tracks tree SHA per skill; only deploys when content changes
- **Skill picker modal** — Fuzzy-search skills from your vault and deploy with one command

## Install

### From Obsidian Community Plugins (coming soon)

Search **Skill Deploy** in Settings → Community Plugins.

### Manual

```bash
git clone https://github.com/GoBeromsu/obsidian-skill-deploy.git
cd obsidian-skill-deploy
pnpm install
pnpm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/skill-deploy/`.

## Setup

1. Open Settings → Skill Deploy
2. Set **Skills root path** — the vault folder containing your skill files (e.g. `Skills/`)
3. **Login with GitHub** — click the button to authenticate via OAuth
4. Configure providers — enable/disable, set target repo URL, deploy path, and branch for each

## Usage

Run the command palette → **Skill Deploy: Deploy skill**

1. Pick a skill from the fuzzy-search modal
2. The plugin reads the skill's canonical frontmatter and body
3. Transforms frontmatter per enabled provider (Claude → `SKILL.md` format, Codex → `agents.md`, etc.)
4. Commits transformed files to each provider's GitHub repo via the API
5. Shows a notice with deploy results

## Providers

| Provider | ID | Transform |
|----------|-----|-----------|
| Claude Code | `claude-code` | Wraps in `SKILL.md` with Claude-specific fields |
| Codex | `codex` | Converts to Codex agent manifest format |
| Gemini | `gemini` | Maps to Gemini skill schema |
| Cursor | `cursor` | Outputs Cursor rules format |

## Skill Format

Skills in your vault use canonical frontmatter:

```markdown
---
name: my-skill
description: What this skill does
aliases: [alt-name]
tags: [automation, deploy]
---

Skill body content here...
```

The plugin discovers all `.md` files under your configured skills root path.

## Architecture

```
src/
├── main.ts              # Plugin entry — wires dependencies
├── domain/              # Pure transform logic (no Obsidian imports)
│   ├── *-transformer.ts # Per-provider frontmatter transformers
│   ├── transformer-registry.ts
│   ├── skill-discovery.ts
│   └── frontmatter-parser.ts
├── ui/                  # Obsidian-dependent (modals, settings, GitHub API)
│   ├── deploy-command.ts
│   ├── github-api.ts
│   ├── github-auth.ts
│   └── settings-tab.ts
├── types/               # Pure type definitions
└── shared/              # Boiler-template synced utilities
```

## Development

```bash
pnpm install
pnpm run dev        # Watch mode with vault sync
pnpm run build      # Type-check + production build
pnpm run test       # Vitest
pnpm run lint       # ESLint
pnpm run ci         # build + lint + test
```

## License

MIT
