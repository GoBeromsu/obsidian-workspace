# Obsidian Plugin Code Review Agent

Simulate the ObsidianReviewBot's static analysis scan on a plugin before or after community PR submission.

This agent mirrors the checks performed by the official `eslint-plugin-obsidianmd` rules. Issues reported here correspond directly to what causes `Changes requested` labels on community PRs.

## Inputs

You receive a plugin directory path in your prompt. You must:
1. Read the relevant source files
2. Check each rule category
3. Report findings grouped by severity

---

## Rule Categories

### 🔴 REQUIRED — Block community submission

These cause `Changes requested` from ObsidianReviewBot and must be fixed.

#### Commands
| Rule | What to look for |
|------|-----------------|
| `no-plugin-name-in-command-name` | `addCommand({ name: 'PluginName: ...' })` — name starts with plugin name |
| `no-plugin-id-in-command-id` | `addCommand({ id: 'plugin-id-...' })` — id includes plugin ID |
| `no-command-in-command-name` | `addCommand({ name: '... Command' })` — contains word "command" |
| `no-command-in-command-id` | `addCommand({ id: '...-command' })` — id contains "command" |

#### UI / Settings
| Rule | What to look for |
|------|-----------------|
| `ui/sentence-case` | Title Case text in `setName()`, `setDesc()`, `addButton`, `placeholder`, tooltip, `getDisplayText()`, `getName()` — must be sentence case |
| `settings-tab/no-manual-html-headings` | `containerEl.createEl('h1'/'h2'/'h3'/'h4', ...)` in settings tab — use `new Setting(el).setName('...').setHeading()` |
| `settings-tab/no-problematic-settings-headings` | `new Setting(el).setHeading()` without `.setName()`, or vice-versa without `.setHeading()` |
| `no-static-styles-assignment` | `el.style.X = value` — any direct style property assignment. Use `el.addClass()`, `el.removeClass()`, `el.toggleClass()`, or `el.setCssProps()` |

#### Vault / API
| Rule | What to look for |
|------|-----------------|
| `hardcoded-config-path` | Hardcoded `.obsidian` string used as path — use `vault.configDir` |
| `vault/iterate` | `vault.getFiles()` followed by `.find(f => f.path === ...)` — use `vault.getFileByPath()` instead |
| `no-tfile-tfolder-cast` | `file as TFile` or `file as TFolder` — use `instanceof TFile` / `instanceof TFolder` |
| `prefer-file-manager-trash-file` | `vault.trash()` or `vault.delete()` — use `fileManager.trashFile()` to respect user settings |
| `platform` | `navigator.platform`, `navigator.userAgent`, `navigator.vendor` for OS detection — use `Platform.isMobile`, `Platform.isDesktop`, etc. |

#### DOM / Components
| Rule | What to look for |
|------|-----------------|
| `no-forbidden-elements` | `document.createElement('iframe')`, `document.createElement('video')`, `document.createElement('audio')` attached to Obsidian UI — forbidden |
| `no-plugin-as-component` | `MarkdownRenderer.render(this, ...)` where `this` is the Plugin — causes memory leaks |
| `no-view-references-in-plugin` | `this.someView = new MyView(...)` stored as plugin property — causes memory leaks |

#### Code Quality — Obsidian-specific
| Rule | What to look for |
|------|-----------------|
| `no-sample-code` | Template code like `onSampleButtonClick()`, `mySetting` variable |
| `sample-names` | Class names `MyPlugin`, `MyPluginSettings`, `MyPluginSettingTab`, `SampleModal` |
| `regex-lookbehind` | `/(?<=...)pattern/` — lookbehind not supported on iOS 15 and earlier |
| `detach-leaves` | `workspace.detachLeavesOfType(...)` called inside `onunload()` — Obsidian handles this |
| `object-assign` | `Object.assign(target, source)` — use spread `{ ...target, ...source }` instead |
| `prefer-abstract-input-suggest` | Hand-copied `TextInputSuggest` class — use built-in `AbstractInputSuggest` |
| `command-id-clean` | Command `id` must not contain the plugin ID — Obsidian namespaces it automatically. Bot message: "The command ID should not include the plugin ID" |
| `command-name-clean` | Command `name` must not contain the plugin name — Obsidian shows it in the UI already. Bot message: "The command name should not include the plugin name" |
| `settings-heading` | Settings headings must not contain "settings", the plugin name, or "General" — use specific category names like "Appearance", "Advanced", "Connection", "Sync". Bot message: "Avoid using 'settings' in settings headings" / "Avoid using 'General' as a heading" |

#### Code Quality — TypeScript/ESLint conventions
Read `references/typescript-conventions.md` for full details and examples. Summary:

| Rule | Bot message |
|------|------------|
| `console-methods` | "Only these console methods are allowed: warn, error, debug." — replace `console.info/log` with `console.debug` |
| `eslint-disable-description` | "Unexpected undescribed directive comment." — add ` -- reason` to every disable |
| `no-unused-disable` | "Unused eslint-disable directive" — remove stale directives |
| `async-no-await` | "Async method 'X' has no 'await' expression" — remove `async` (exception: `ItemView.onOpen/onClose`) |
| `no-any` | "Unexpected any." — use `unknown` or a typed interface. **The eslint-disable directive for this rule is also banned** — you cannot suppress it, you must fix the type. See `references/typescript-conventions.md` for module augmentation pattern (workspace events) and `unknown` double-cast pattern. |
| `object-stringify` | "'X' will use Object's default stringification" — wrap with `String()` |
| `floating-promises` | "Promises must be awaited..." — add `void` or `await` |
| `unnecessary-assertion` | "This assertion is unnecessary" — remove the `as Type` cast |
| `eslint-config-modern` | ⚠️ False positive — use `/skip` (`tseslint.defineConfig()` doesn't exist in 8.x) |

---

### 🟡 RECOMMENDED — Advisory (won't block, but will be noted)

| Rule | What to look for |
|------|-----------------|
| `commands/no-default-hotkeys` | `addCommand({ hotkeys: [...] })` — providing default hotkeys is discouraged |
| `validate-manifest` | `minAppVersion` set too low (< `1.6.0`), missing required fields, `version` doesn't match semver |
| `validate-license` | LICENSE file missing copyright notice, wrong SPDX format |

---

## Process

### Step 1: Read Manifest

Read `manifest.json`. Extract:
- `id` — used for plugin ID checks
- `name` — used for plugin name checks in commands
- `version` — consistency check
- `minAppVersion` — validate not too old

### Step 2: Scan Source Files

Find all TypeScript source files (exclude `node_modules/`, `dist/`, `.omc/`):
```bash
find src/ -name "*.ts" | grep -v node_modules | grep -v dist
```

For each file:
1. Read the file
2. Apply relevant rules based on the file's content patterns

**High-priority files to always check:**
- `src/main.ts` — commands, plugin class, onunload
- `src/ui/settings*.ts` or `src/ui/settings-tab.ts` — headings, sentence case, inline styles
- `src/ui/**/*.ts` — sentence case, inline styles
- `src/domain/**/*.ts` — vault API usage, cast patterns

### Step 3: Check Each Rule

For each rule, grep/read for the pattern. Examples:

```bash
# Check for plugin name in command names (adapt PluginName from manifest)
grep -n "addCommand" src/main.ts

# Check for HTML headings in settings
grep -rn "createEl.*h[1-4]" src/ui/

# Check for inline styles
grep -rn "\.style\." src/

# Check for hardcoded .obsidian
grep -rn '\.obsidian' src/

# Check for navigator platform
grep -rn 'navigator\.' src/

# Check for TFile/TFolder cast
grep -rn 'as TFile\|as TFolder' src/

# Check for sample names
grep -rn 'MyPlugin\|SampleModal\|mySetting\b' src/

# Check for vault.trash/delete
grep -rn 'vault\.trash\|vault\.delete' src/

# Check for vault iterate pattern
grep -rn 'getFiles()' src/

# Check for MarkdownRenderer with plugin
grep -rn 'MarkdownRenderer.render' src/

# Check for view references stored in plugin
grep -n 'this\.' src/main.ts | grep -i 'view\|leaf'

# Check for detachLeavesOfType in onunload
grep -A 20 'onunload' src/main.ts | grep 'detachLeaves'

# Check for Object.assign
grep -rn 'Object\.assign' src/

# Check for regex lookbehind
grep -rn '(?<=' src/

# Check for default hotkeys
grep -rn 'hotkeys:' src/main.ts
```

### Step 4: Report Findings

Format the report as:

```
## Code Review: <Plugin Name> v<version>

### 🔴 Required Fixes (X issues)

[For each issue:]
**[rule-name]** — <file>:<line>
> `<offending code snippet>`
Fix: <specific fix instruction>

### 🟡 Recommendations (X issues)

[Same format]

### ✅ Passing Rules
[List rules with no violations]

### Summary
X required fixes, Y recommendations.
[If 0 required]: Ready for community submission.
[If >0 required]: Fix all 🔴 items, push to main, then re-trigger bot.
```

### Step 4b: Check ESLint Tooling Setup

Misconfigured ESLint is the #1 cause of "local lint passes, bot rejects" — the obsidianmd rules must be present in BOTH package.json AND configured in eslint.base.js. Having the package in devDependencies without the rules block means the plugin is never checked locally.

**Check package.json:**
```bash
node -e "const p = require('./package.json'); const d = {...(p.dependencies||{}), ...(p.devDependencies||{})}; console.log('eslint:', d.eslint); console.log('obsidianmd plugin:', d['eslint-plugin-obsidianmd'] || '❌ MISSING'); console.log('deprecated eslint-plugin:', d['@typescript-eslint/eslint-plugin'] || 'ok (absent)'); console.log('deprecated parser:', d['@typescript-eslint/parser'] || 'ok (absent)');"
ls .eslintrc* 2>/dev/null && echo "❌ legacy .eslintrc found — conflicts with flat config" || echo "✅ no legacy .eslintrc"
```

**Check eslint.base.js content** (critical — package.json alone is not enough):
```bash
grep -n "eslint-plugin-obsidianmd\|obsidianmd" eslint.base.js 2>/dev/null || echo "❌ obsidianmd not found in eslint.base.js"
grep -n "obsidianmd/ui/sentence-case\|obsidianmd/commands" eslint.base.js 2>/dev/null || echo "❌ obsidianmd rules block missing from eslint.base.js"
```

Flag as 🔴 Required if:
- `eslint-plugin-obsidianmd` is missing from package.json — bot rules won't run locally
- `eslint.base.js` does not import `eslint-plugin-obsidianmd` — package installed but not wired in
- `eslint.base.js` does not have an obsidianmd rules block — **this is the silent failure mode**: lint passes locally, bot rejects
- `eslint` is `^8.x` — mismatch with boiler template target (`^9.x`)
- `@typescript-eslint/eslint-plugin` or `@typescript-eslint/parser` are present — deprecated, causes version conflicts
- `.eslintrc.json` exists alongside `eslint.config.js` — legacy config overrides flat config

If eslint.base.js is missing the obsidianmd block, sync it from `obsidian-boiler-template/tooling/shared/eslint.base.js`.

### Step 5: Run the Official Linter (mandatory)

Always run `pnpm lint` — this is the single most reliable check before submission. If the tooling setup is correct (Step 4b passes), this will catch all locally reproducible bot violations.

```bash
pnpm lint 2>&1 | head -80
```

**Zero errors = locally clean.** If errors appear, fix them all before proceeding.

Note: some bot rules are not locally reproducible (see bot-specific manual checklist in SKILL.md). After lint passes, run through those manually.
