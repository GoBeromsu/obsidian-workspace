# Rules

> Mandatory code rules for all plugins. Violations block further work until resolved.

## Overview

| Rule | Summary |
|------|---------|
| [Rule 1](#rule-1-indexts-is-an-entry-point-not-a-dumping-ground) | `index.ts` is for re-exports and wiring only |
| [Rule 2](#rule-2-no-catch-all-files) | `utils.ts`, `helpers.ts`, `service.ts` are banned |
| [Rule 3](#rule-3-single-responsibility-principle--absolute) | One file = one responsibility |
| [Rule 4](#rule-4-200-loc-hard-limit) | 200 LOC max per `.ts`/`.tsx` file |
| [Rule 5](#rule-5-obsidian-native-ui-only) | Use Obsidian components and CSS variables only, no raw HTML |
| [Rule 6](#rule-6-no-hardcoded-obsidian-config-folder) | Never hardcode `.obsidian` in plugin runtime code |

### Grep enforcement commands

```bash
# Find catch-all file names (violations)
rg --files */src/ | rg "(utils|helpers|service|common)\.ts$"

# Find index.ts files with too much logic
rg -c "export function\|export class" */src/**/index.ts

# Find layer violations
rg "import.*from 'obsidian'" */src/domain/ */src/utils/ */src/types/
```

---

## Rule 1: index.ts is an ENTRY POINT, NOT a dumping ground

`index.ts` files MUST ONLY contain:
- Re-exports (`export { ... } from "./module"`)
- Factory function calls that compose modules
- Top-level wiring/registration (hook registration, plugin setup)

`index.ts` MUST NEVER contain:
- Business logic implementation
- Helper/utility functions
- Type definitions beyond simple re-exports
- Multiple unrelated responsibilities mixed together

**If you find mixed logic in index.ts**: Extract each responsibility into its own dedicated file BEFORE making any other changes. This is not optional.

## Rule 2: No Catch-All Files

A single `utils.ts`, `helpers.ts`, `service.ts`, or `common.ts` is a **gravity well** — every unrelated function gets tossed in, and it grows into an untestable, unreviewable blob.

**These file names are BANNED as top-level catch-alls.** Instead:

| Anti-Pattern | Refactor To |
|--------------|-------------|
| `utils.ts` with `formatDate()`, `slugify()`, `retry()` | `date-formatter.ts`, `slugify.ts`, `retry.ts` |
| `service.ts` handling auth + billing + notifications | `auth-service.ts`, `billing-service.ts`, `notification-service.ts` |
| `helpers.ts` with 15 unrelated exports | One file per logical domain |

**Design for reusability from the start.** Each module should be:
- **Independently importable** — no consumer should need to pull in unrelated code
- **Self-contained** — its dependencies are explicit, not buried in a shared grab-bag
- **Nameable by purpose** — the filename alone tells you what it does

If you catch yourself typing `utils.ts` or `service.ts`, STOP and name the file after what it actually does.

## Rule 3: Single Responsibility Principle — ABSOLUTE

Every `.ts` file MUST have exactly ONE clear, nameable responsibility.

**Self-test**: If you cannot describe the file's purpose in ONE short phrase (e.g., "parses YAML frontmatter", "matches rules against file paths"), the file does too much. Split it.

| Signal | Action |
|--------|--------|
| File has 2+ unrelated exported functions | **SPLIT NOW** — each into its own module |
| File mixes I/O with pure logic | **SPLIT NOW** — separate side effects from computation |
| File has both types and implementation | **SPLIT NOW** — types.ts + implementation.ts |
| You need to scroll to understand the file | **SPLIT NOW** — it's too large |

## Rule 4: 200 LOC Hard Limit

Any `.ts`/`.tsx` file exceeding **200 lines of code** (excluding prompt strings, template literals containing prompts, and `.md` content) is an **immediate code smell**.

**When you detect a file > 200 LOC**:
1. **STOP** current work
2. **Identify** the multiple responsibilities hiding in the file
3. **Extract** each responsibility into a focused module
4. **Verify** each resulting file is < 200 LOC and has a single purpose
5. **Resume** original work

Prompt-heavy files (agent definitions, skill definitions) where the bulk of content is template literal prompt text are EXEMPT from the LOC count — but their non-prompt logic must still be < 200 LOC.

### How to Count LOC

**Count these** (= actual logic):
- Import statements
- Variable/constant declarations
- Function/class/interface/type definitions
- Control flow (`if`, `for`, `while`, `switch`, `try/catch`)
- Expressions, assignments, return statements
- Closing braces `}` that belong to logic blocks

**Exclude these** (= not logic):
- Blank lines
- Comment-only lines (`//`, `/* */`, `/** */`)
- Lines inside template literals that are prompt/instruction text
- Lines inside multi-line strings used as documentation/prompt content

**Quick method**: Read the file -> subtract blank lines, comment-only lines, and prompt string content -> remaining count = LOC.

**Example**:
```typescript
// 1  import { foo } from "./foo";          <- COUNT
// 2                                         <- SKIP (blank)
// 3  // Helper for bar                      <- SKIP (comment)
// 4  export function bar(x: number) {       <- COUNT
// 5    const prompt = `                     <- COUNT (declaration)
// 6      You are an assistant.              <- SKIP (prompt text)
// 7      Follow these rules:                <- SKIP (prompt text)
// 8    `;                                   <- COUNT (closing)
// 9    return process(prompt, x);           <- COUNT
// 10 }                                      <- COUNT
```
-> LOC = **5** (lines 1, 4, 5, 9, 10). Not 10.

When in doubt, **round up** — err on the side of splitting.

## Rule 5: Obsidian-Native UI Only

All plugin UI must use Obsidian's built-in components and CSS variables exclusively. Do not construct UI with raw HTML elements or inline styles.

**Use these** (Obsidian API components):
- `Setting`, `Modal`, `ItemView`, `Notice`, `Menu`, `ToggleComponent`
- `setIcon()`, `createEl()`, `createDiv()`, `createSpan()`
- `containerEl.createEl('button')` over `document.createElement('button')`

**Use these** (CSS custom properties for theming):
- `var(--background-primary)`, `var(--background-secondary)`
- `var(--text-normal)`, `var(--text-muted)`, `var(--text-faint)`
- `var(--interactive-accent)`, `var(--interactive-hover)`
- All `var(--*)` tokens from Obsidian's theme system

**Banned**:
- `innerHTML` for UI construction
- `document.createElement()` when an Obsidian API equivalent exists
- Inline styles (`style="..."`) — use CSS classes instead
- Hardcoded hex/rgb colors — use CSS variables for theme compatibility
- Custom HTML layouts when a `Setting` component would suffice

**Why**: Obsidian plugins must respect user themes (light, dark, custom). Hardcoded colors and raw HTML break theme compatibility and produce inconsistent UX across the plugin ecosystem.

**Extended vocabulary**: See [design-system/README.md](design-system/README.md) for the canonical token set, component classes (`.plugin-*`), iconography (`design-system/assets/ICONOGRAPHY.md`), UX principles (`design-system/UX_PRINCIPLES.md`), and content/tone rules that extend this rule. When a UI decision is ambiguous, resolve it there before inventing a new pattern.

Check for violations:

```bash
# Find innerHTML usage (potential violations)
rg "innerHTML" */src/ui/

# Find hardcoded colors
rg "#[0-9a-fA-F]{3,8}|rgb\(|rgba\(" */src/ --glob="*.ts"

# Find inline styles
rg 'style="' */src/ui/
```

## Rule 6: No Hardcoded Obsidian Config Folder

Obsidian's configuration folder is **not necessarily `.obsidian`**. Users can change it.

**In plugin runtime code, never hardcode `.obsidian`.** Use `Vault#configDir` instead:

```ts
const pluginDataPath = `${app.vault.configDir}/plugins/${plugin.manifest.id}/data.json`
```

**Use this rule when**:
- Reading or writing plugin data
- Resolving plugin-local cache/database paths
- Building paths under `plugins/<plugin-id>/...`

**Do not do this in runtime code**:

```ts
const path = `${vaultBasePath}/.obsidian/plugins/${pluginId}/data.json`
```

**Why**: a hardcoded `.obsidian` path breaks users who configured a different vault config directory.

Check for violations:

```bash
rg -n "\.obsidian" */src/ --glob="*.ts"
rg -n "configDir" */src/ --glob="*.ts"
```

---

## How to Apply

When reading, writing, or editing ANY `.ts`/`.tsx` file:

1. **Check the file you're touching** — does it violate any rule above?
2. **If YES** — refactor FIRST, then proceed with your task
3. **If creating a new file** — ensure it has exactly one responsibility and stays under 200 LOC
4. **If adding code to an existing file** — verify the addition doesn't push the file past 200 LOC or add a second responsibility. If it does, extract into a new module.

---

## See Also

- [Architecture](architecture.md) — Layer structure, dependency rules
- [Exploration Guide](exploration-guide.md) — Study paths, grep patterns, feature→file mapping
- [Patterns](patterns.md) — Proven implementation patterns
- [Gotchas](gotchas.md) — Known pitfalls
- [Obsidian API](obsidian-api.md) — API quirks and workarounds
- [Collaboration](collaboration.md) — Agent roles and handoff protocol
