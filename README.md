# Obsidian Workspace

My Obsidian plugin ecosystem. Each plugin lives as an independent repository, linked here as submodules. **Your tools should fit your thinking, not the other way around.**

## Plugins

| Plugin | Description |
|--------|-------------|
| [obsidian-eagle-plugin](https://github.com/GoBeromsu/obsidian-eagle-plugin) | Upload and manage images via Eagle integration |
| [Metadata-Auto-Classifier](https://github.com/GoBeromsu/Metadata-Auto-Classifier) | AI-powered automatic metadata generation for notes |
| [Open-smart-connections](https://github.com/GoBeromsu/Open-smart-connections) | Semantic search and related notes using local embeddings |
| [obsidian-boiler-template](https://github.com/GoBeromsu/obsidian-boiler-template) | Seed template for new plugins — fork this to start |

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
pnpm ci       # build + lint + test
```


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
