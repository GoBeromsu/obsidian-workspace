# AGENTS.md

Control plane for independent Obsidian plugin repos — not a package monorepo. Child plugins are git-ignored clones from `workspace/plugins.manifest.json` and own their code and releases; `hermes-cron-viewer/` is the only tracked plugin.

## Before any plugin work

1. Bump `obsidian` to latest in that plugin (`bun add -d obsidian@latest` / `pnpm add -D obsidian@latest`), then build + typecheck.
2. Diff the new `obsidian.d.ts`/changelog and delete what it makes obsolete: workarounds, shims, `as any` casts, deprecated calls. Prefer the native API over local code.
3. Lint with latest `eslint-plugin-obsidianmd` (`recommended` config). Plugins without it get it added. Lint errors block like type errors.

## Blocking rules

1. `index.ts` holds re-exports and wiring only.
2. No catch-all `utils.ts` / `helpers.ts` / `service.ts` / `common.ts`; name modules after their responsibility.
3. One responsibility per `.ts` file; split I/O from pure logic.
4. ≤ 200 logic LOC per `.ts`/`.tsx`.
5. Obsidian-native UI only — no `innerHTML`, inline styles, or hardcoded colors; use `Setting`, `setIcon()`, `createEl()`, `var(--*)`.
6. Never hardcode `.obsidian`; derive from `app.vault.configDir`.
7. `domain/`, `types/`, `utils/` never import `obsidian`.

## Never

- Edit a plugin's `src/shared/` — change `obsidian-boiler-template` and port it downstream.
- Release locally (`git tag`, `git push --tags`, `gh release`, `npm publish`). Releases are CI-only.
- Point the workbench (`workspace/dev.mjs`, Eagle-only) at any vault but `<root>/.dev-vault`, or rewrite Obsidian's vault registry. Tests use temp vaults and the fake CLI in `workspace/dev-test-fixture.mjs`.
- Store `validateConfigDir`'s absolute path on a receipt; `runtime.configDir` stays vault-relative.
- Add a root `package.json`. Root scripts are dependency-free Node ESM and must run on Node 22 (CI) and 24.
- Cross toolchains: Hermes is Bun, Eagle is pnpm.
- Persist Hermes job/output bodies; only parsed projections go to disk.

## Workflow

- Branch `feature|fix|refactor|chore/<name>` from `main`, Conventional Commits, PR into `main` (required check: `report`).
- Done = build, typecheck, lint, tests pass. Runtime changes also need `OBSIDIAN_VAULT_PATH=.dev-vault node workspace/dev.mjs verify <plugin>` and a clean `obsidian vault=.dev-vault dev:errors`.
