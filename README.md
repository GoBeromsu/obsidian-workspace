# Obsidian Workspace

My Obsidian plugin ecosystem. Each plugin lives as an independent repository, linked here as submodules. **Your tools should fit your thinking, not the other way around.**

This repository is a **submodule workspace** and portfolio control plane, not a package monorepo.

- Plugin implementation and final releases live in child repos.
- Shared deterministic contracts live in `obsidian-boiler-template`.
- Portfolio visibility and release readiness live at the root.

## Plugins

| Plugin | Description |
|--------|-------------|
| [obsidian-eagle-plugin](https://github.com/GoBeromsu/obsidian-eagle-plugin) | Upload and manage images via Eagle integration |
| [Metadata-Auto-Classifier](https://github.com/GoBeromsu/Metadata-Auto-Classifier) | AI-powered automatic metadata generation for notes |
| [open-connections](https://github.com/GoBeromsu/open-connections) | Semantic search and related notes using local embeddings |
| [obsidian-bible-search](https://github.com/GoBeromsu/obsidian-bible-search) | Bible verse search plugin |
| [obsidian-qmd](https://github.com/GoBeromsu/obsidian-qmd) | QMD semantic search integration |
| [youtube-note-playlist](https://github.com/GoBeromsu/obsidian-note-player) | YouTube music player via yt-dlp |
| [obsidian-boiler-template](https://github.com/GoBeromsu/obsidian-boiler-template) | Seed template for new plugins — fork this to start |
| [agent-skill-deploy](https://github.com/GoBeromsu/agent-skill-deploy) | Deploy agent skills from a vault to provider repos |

## Control Plane

The root repo owns:

- [workspace plugin manifest](workspace/plugins.manifest.json)
- [workspace topology](docs/workspace-topology.md)
- [plugin architecture contract](docs/plugin-architecture.md)
- [release architecture](docs/release-architecture.md)
- [release note contract](docs/release-note-contract.md)
- [generated workspace catalog](docs/workspace-catalog.md)
- [design system](docs/design-system/README.md)

The current root-level release gate is report-only. It validates portfolio metadata and emits a release readiness report without taking release authority away from child plugin repos.

The former root-local `obsidian-skill-deploy` incubator has been promoted into the independent [agent-skill-deploy](https://github.com/GoBeromsu/agent-skill-deploy) submodule.

## Quick Start

```bash
git clone --recurse-submodules https://github.com/GoBeromsu/obsidian-workspace.git
cd obsidian-workspace

# Set your vault path
cp .env.example .env
# Edit .env → OBSIDIAN_VAULT_PATH=/path/to/your/vault

# Work on a specific plugin
cd obsidian-eagle-plugin
pnpm install
pnpm dev
```

### Commands (per plugin)

```bash
pnpm dev      # Watch mode + hot reload into vault
pnpm build    # Production build
pnpm test     # Vitest
pnpm lint     # ESLint
pnpm run ci   # build + lint + test
```

## OMX

This workspace currently standardizes on **user-scoped OMX**.

- Active OMX config: `~/.codex/config.toml`
- User OMX orchestration contract: `~/.codex/AGENTS.md`
- Project-specific guidance: `./AGENTS.md`
- Persisted scope marker: `./.omx/setup-scope.json`
- Repo-local `./.codex/config.toml` is not authoritative unless setup is intentionally switched to `--scope project`

### Daily workflow

```bash
# launch Codex with OMX wiring
omx --madmax --high

# common in-session workflow surfaces
$deep-interview "clarify the task"
$ralplan "approve the implementation plan"
$team 3:executor "execute the approved plan in parallel"
$ralph "carry the approved plan to completion"
```

### Operator commands

```bash
omx setup --force --verbose
omx doctor
omx status
omx resume
omx cleanup
omx explore --prompt "find where team state is written"
omx sparkshell git status --short
```

`omx sparkshell` takes the command directly. Use `omx sparkshell git status`, not `omx sparkshell -- git status`.


## Contributing

1. Fork the repository
2. Create your branch (`git checkout -b feature/your-feature`)
3. Commit with Conventional Commits (`git commit -m 'feat: add something'`)
4. Push and open a Pull Request against `main`

Branch naming: `feature/<name>`, `fix/<name>`, `refactor/<name>` — no direct commits to `main`.

Releases are CI-only. Do not run `git tag` or `gh release` locally — this is enforced at the tooling level, not by convention.

## Philosophy

**Native-first.** Every UI element uses Obsidian's own component system. No raw HTML, no external frameworks.

**Structural over advisory.** Rules that matter get enforced at the tooling level — hooks, permission deny lists, CI gates. Not just documented.

**Minimal impact.** Changes touch only what they need to. The right amount of code is the minimum that solves the problem.

**Closed verification loop.** After every code change: build → reload → error check → screenshot → eval. No manual testing cycle.

## License

MIT — see [LICENSE](LICENSE) for details.

---

[Beomsu Koh](https://github.com/GoBeromsu) · [Buy me a coffee](https://buymeacoffee.com/gobeumsu9)
