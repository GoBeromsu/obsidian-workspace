# Obsidian Workspace

My Obsidian plugin ecosystem. Each plugin lives as an independent repository, mapped here by the workspace manifest. **Your tools should fit your thinking, not the other way around.**

This repository is a **linked workspace** and portfolio control plane, not a package monorepo. It tracks the map, never the plugin code: plugin directories are git-ignored local clones materialised from [`workspace/plugins.manifest.json`](workspace/plugins.manifest.json).

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

The former root-local `obsidian-skill-deploy` incubator has been promoted into the independent [agent-skill-deploy](https://github.com/GoBeromsu/agent-skill-deploy) repository.

## Quick Start

Requires Node.js 24 or newer. This workbench is Eagle-only for now: Eagle is the only audited initial selector. Other plugin selectors are explicitly unsupported.

```bash
git clone https://github.com/GoBeromsu/obsidian-workspace.git
cd obsidian-workspace

# Clone every plugin repo listed in the manifest (idempotent).
# Bootstrap does not install dependencies.
node workspace/bootstrap.mjs

# Dedicated empty owned vault — never a production vault
cp .env.example .env
# .env → OBSIDIAN_VAULT_PATH=.dev-vault

node workspace/dev.mjs list
node workspace/dev.mjs init
```

Install and enable the Obsidian CLI, then in Obsidian use **Open folder as vault** to register only `root/.dev-vault`. `obsidian://choose-vault` is a convenient optional entry point. Never rewrite the Obsidian vault registry or open a production vault with this workbench.

The workbench does not auto-install. Install Eagle dependencies yourself only when they are missing:

```bash
cd obsidian-eagle-plugin
pnpm install
cd ..
```

Then from the workspace root (`build` / `watch` / `verify` require an explicit selector; there is no default):

```bash
node workspace/dev.mjs build eagle
node workspace/dev.mjs watch eagle
node workspace/dev.mjs verify eagle
```

Live `build` and `watch` use the child's existing **build** script, not the legacy `dev` script. Root `.env` is forwarded into the child process and child deployment paths are blocked. Artifacts are runtime-only; plugin `data/` and settings are preserved. Live `configDir` is discovered through the Obsidian API: its receipt is vault-relative and supports custom configuration folders. A missing live vault or unavailable Obsidian CLI is an error.

Successful `build` and `watch` JSON output includes `deployed`, `reloaded`, and `verified` receipts. Stop `watch` with Ctrl-C: before deployment, cancellation stops the cycle; once deployment begins, the bounded reload and verification finish before watch exits.

Focused workbench validation:

```bash
node --test workspace/dev-safety.test.mjs workspace/dev-runtime.test.mjs workspace/dev-cycle.test.mjs workspace/dev-watch.test.mjs
```

`bootstrap.mjs` only clones what is missing. It never fetches, checks out or deletes an existing working tree, so it is safe to rerun on any machine.

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
