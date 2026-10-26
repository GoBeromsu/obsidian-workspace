@AGENTS.md

## Layout

Control plane for git-ignored plugin clones. No root `package.json`; run `bun workspace/<x>.ts`.

- `workspace/plugins.json`: name, `repo_path`, `repo_slug`, plugin `id`
- `bootstrap.ts`: clone missing plugin repos
- `dev-vault.ts [id]`: create `.dev-vault/` (or `.dev-vault-<id>/` with only that plugin) and symlink each `<repo_path>/dist` into `.obsidian/plugins/<id>`
- `dev.ts <id>`: run the plugin's `bun run dev` and `plugin:reload` via the Obsidian CLI on dist changes
- `status.ts`: CI state, latest release, open PRs per plugin
- `validate.ts`: manifest check (CI job `report`)

Plugin contract: `bun run dev` / `bun run build` emit `main.js`, `manifest.json`, `styles.css` into `dist/`.

Naming: GitHub repo = local folder = `package.json` name = `obsidian-<slug>`; plugin id = `<slug>` without `obsidian`. Published ids are never changed.
