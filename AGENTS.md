# AGENTS.md

Rules shared by every plugin. Plugin-specific rules live in that plugin's own `AGENTS.md`.

## Before any plugin work

1. Bump `obsidian` to latest in that plugin (`bun add -d obsidian@latest` / `pnpm add -D obsidian@latest`), then build + typecheck.
2. Diff the new `obsidian.d.ts`/changelog and delete what it makes obsolete: workarounds, shims, `as any` casts, deprecated calls. Prefer the native API over local code.
3. Lint with latest `eslint-plugin-obsidianmd` (`recommended` config). Plugins without it get it added. Lint errors block like type errors.

## Blocking rules

1. `index.ts` holds re-exports and wiring only.
2. No catch-all `utils.ts` / `helpers.ts` / `service.ts` / `common.ts`; name modules after their responsibility.
3. One responsibility per `.ts` file; split I/O from pure logic.
4. ≤ 500 logic LOC per `.ts`/`.tsx`.
5. UI priority: Obsidian components first (`Setting`, `Modal`, `SuggestModal`, `AbstractInputSuggest`, `ButtonComponent`, `ItemView`, `Menu`, `Notice`), then `createEl()`/`createDiv()`/`createFragment()` + `setIcon()`. Never `document.createElement`, `innerHTML`, inline styles, hardcoded colors, `!important`, or `:has`; style with `var(--*)`.
6. Never hardcode `.obsidian`; derive from `app.vault.configDir`.
7. `domain/`, `types/`, `utils/` never import `obsidian`.
8. Pass every check of the [community.obsidian.md](https://community.obsidian.md/) plugin review — errors, warnings, and recommendations:
   - `minAppVersion` covers every API used (`obsidianmd/no-unsupported-api`); no deprecated APIs.
   - Settings tabs implement `getSettingDefinitions()`.
   - Popout-safe: `activeDocument`, `activeWindow.setTimeout`/`clearTimeout`.
   - `manifest.json` `id` matches the registered ID; name not all-caps; `authorUrl` is a live profile/site, not a repo.
   - Releases: built in CI from a committed lockfile (reproducible `main.js`), artifact attestations for `main.js`/`styles.css`, a release description, only `main.js`/`manifest.json`/`styles.css` attached.
   - Drop flagged packages (`builtin-modules`, `lint-staged`, `eslint-plugin-vitest`, `axios`, `node-fetch`, `dotenv`, …) and fix vulnerable dependencies.
   - Prefer the vault API over Node `fs`, `child_process`, full-vault enumeration, and clipboard access; keep any that remain justified in the README.

## Testing

- No Obsidian mocks, DOM shims (jsdom/happy-dom), or fixture harnesses. Unit-test pure logic only.
- UI and Obsidian integration are verified in real Obsidian against `.dev-vault`.

## Never

- Edit a plugin's `src/shared/` — change `obsidian-boiler-template` and port it downstream.
- Release locally (`git tag`, `git push --tags`, `gh release`, `npm publish`). Releases are CI-only.
- Point the workbench (`workspace/dev.mjs`) at any vault but `<root>/.dev-vault`, or rewrite Obsidian's vault registry.
- Store `validateConfigDir`'s absolute path on a receipt; `runtime.configDir` stays vault-relative.
- Add a root `package.json`. Root scripts are dependency-free Node ESM and must run on Node 22 (CI) and 24.
- Cross toolchains: use the package manager whose lockfile the plugin has (`bun.lock` → Bun, `pnpm-lock.yaml` → pnpm).
- No Comment in codebase

## General Rules

- Branch `feature|fix|refactor|chore/<name>` from `main`, Conventional Commits, PR into `main` (required check: `report`).
- Done = build, typecheck, lint, tests pass.
  - Runtime changes also need
    - `OBSIDIAN_VAULT_PATH=.dev-vault` and a clean `obsidian vault=.dev-vault dev:errors`.
