Applies to all plugins. Plugin-specific rules belong in their own `AGENTS.md`.

## Workflow

1. Update `obsidian` and `eslint-plugin-obsidianmd` using the plugin's existing package manager.
2. Review API changes. Prefer native APIs over deprecated calls, workarounds, shims, and unsafe casts.
3. Audit obsolete fixtures, mocks, DOM shims, and test harnesses. Remove what is unnecessary; preserve meaningful regression coverage.
4. Follow the latest [Obsidian developer policies](https://docs.obsidian.md/community-directory/developer-policies) and [plugin guidelines](https://docs.obsidian.md/plugins/releasing/plugin-guidelines).

## Code

- **Obsidian-native first.** 
  - Prefer built-in UI components, Vault/FileManager APIs, and theme variables over custom implementations.
- Utilize [Obsidian](https://obsidian.md/cli) such as debugging, capturing, qa ...
- Avoid `document.createElement`; never use `innerHTML`, inline styles, hardcoded colors, `!important`, or `:has`.
- Keep entry points limited to lifecycle, registration, exports, and wiring.
- One responsibility per module, maximum 500 logic LOC. Separate I/O from pure logic.
- Keep `domain/`, `types/`, and `utils/` independent of `obsidian`.
- Prefer self-documenting code; comment only non-obvious invariants.
  - Comments can easily become outdated
- Never hardcode `.obsidian`; use `app.vault.configDir`.
- Register and clean up listeners, timers, and resources through Obsidian's lifecycle APIs.
- Keep startup lightweight, avoid unnecessary vault scans, and support popout windows.
- Use Bun exclusively. 
  - Migrate existing lockfiles to `bun.lock` and remove other package-manager configurations.

## Interaction Design

**Design for usability and delight.** Motion, microinteractions, and sensory feedback are integral to the user experience, not merely decoration.

- **Microinteractions:** Provide immediate, meaningful feedback for user actions and state changes.
- **Physicality:** Use natural easing, spring dynamics, and direct manipulation to make interactions feel tactile and responsive.
- **Contextual delight:** Introduce playful, surprising, and context-aware details that reinforce the product's personality.
- **Motion choreography:** Preserve spatial continuity and visual hierarchy through coherent transitions and timing.
- **Multisensory feedback:** Use purposeful animation, sound, and haptics when they enhance the interaction.
- **Craft and restraint:** Preserve usability, performance, accessibility, and user control. Respect reduced-motion preferences and avoid intrusive audio.

**Review for delight, not just usability.** Actively identify missed opportunities for expressive motion, tactile feedback, and memorable microinteractions. Do not remove meaningful animation merely because it is not functionally necessary.

## Safety

- Never edit generated or shared copies directly; update their upstream source.
- Never modify user vaults or Obsidian's vault registry. Use `.dev-vault` for development.
- Unit-test pure logic; verify Obsidian UI and integrations in the real application.
- Keep configuration paths vault-relative.
- Minimize dependencies, network access, and filesystem permissions. Disclose external access.
- Releases are CI-only. Never tag, publish, or create releases locally.

## Done

- Branch from `main` using `feature|fix|refactor|chore/<name>`.
- Use Conventional Commits and PRs into `main` (required check: `report`).
- Build, typecheck, lint (`eslint-plugin-obsidianmd` recommended), and tests pass.
- Runtime changes require a clean `obsidian vault=.dev-vault dev:errors` check.
- **Before release, pass the official [Obsidian Community preview scan](https://docs.obsidian.md/community-directory/manage-entry)** on the pushed branch. 
  - Resolve every Error, Warning, and Recommendation.
  - Preferred Aside (browser agent)
- Report scan results and unresolved verification gaps. Never claim a pass without an actual scan result.