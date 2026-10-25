Applies to all plugins. Plugin-specific rules go in the plugin's own `AGENTS.md`.

## Workflow

1. Update `obsidian` and `eslint-plugin-obsidianmd` with the plugin's package manager.
2. Prefer native APIs over deprecated calls, shims, and unsafe casts.
3. Remove obsolete mocks, DOM shims, and fixtures; keep meaningful regression coverage.
4. Follow the [developer policies](https://docs.obsidian.md/community-directory/developer-policies) and [plugin guidelines](https://docs.obsidian.md/plugins/releasing/plugin-guidelines).

## Code

- Obsidian-native first: built-in UI components, Vault/FileManager APIs, theme variables.
- Use the [Obsidian CLI](https://obsidian.md/cli) for debugging, screenshots, and QA.
- Never use `document.createElement`, `innerHTML`, inline styles, hardcoded colors, `!important`, or `:has`.
- Entry points hold only lifecycle, registration, exports, and wiring.
- One responsibility per module, max 500 logic LOC; separate I/O from pure logic.
- `domain/`, `types/`, `utils/` never import `obsidian`.
- Comment only non-obvious invariants.
- Use `app.vault.configDir`, never `.obsidian`.
- Register listeners, timers, and resources through Obsidian lifecycle APIs.
- Keep startup light, avoid vault scans, support popout windows.
- Bun only: use `bun.lock`, remove other package-manager config.

## Interaction Design

Motion, microinteractions, and sensory feedback are part of the UX, not decoration.

- Give immediate feedback for every action and state change.
- Use natural easing and springs; keep transitions spatially coherent.
- Add context-aware delight that fits the product's personality.
- Use sound and haptics only when they help; reduced-motion softens motion, never removes feedback; no intrusive audio.
- Review for missed delight, not just usability. Never remove meaningful animation for being non-essential.

## Safety

- Edit upstream sources, never generated or shared copies.
- Never touch user vaults or their vault-registry entries; develop only in `.dev-vault` or `.dev-vault-<id>`.
- Unit-test pure logic; verify UI and integrations in the real app.
- Config paths are vault-relative.
- Minimize dependencies, network access, and filesystem permissions; disclose external access.
- Releases are CI-only: never tag, publish, or release locally.

## Done

- Branch from `main` as `feature|fix|refactor|chore/<name>`; Conventional Commits; PR into `main` (required check `ci / report`).
- Build, typecheck, lint (`eslint-plugin-obsidianmd` recommended), and tests pass.
- Runtime changes: clean `obsidian vault=<dev vault> dev:errors`.
- Before release, pass the [Community preview scan](https://docs.obsidian.md/community-directory/manage-entry) on the pushed branch (Aside browser agent preferred); resolve every Error, Warning, and Recommendation.
- Report scan results and verification gaps; never claim a pass without a real scan.
