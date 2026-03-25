---
name: obsidian-publish
description: Guide for submitting an Obsidian plugin to the community marketplace for the first time. Use this skill when the user asks to "publish", "submit", "release to community", "add to obsidian community plugins", "PR to obsidian-releases", or wants to know what to do before their first community release. Also trigger when the user asks for a publish checklist, wants to verify plugin submission readiness, needs to fix bot validation errors ("Validation failed" label), or wants to re-trigger the bot after fixing issues. This is distinct from ongoing `pnpm release:*` version bumps — it covers the one-time community-plugins.json PR flow and all post-submission bot feedback loops.
---

# Obsidian Publish

First-time submission of a plugin to the Obsidian community marketplace.

This is a **one-time process** distinct from ongoing `pnpm release:*` version bumps. The goal: get the plugin listed in [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases).

---

## Step 0: Run Code Review Agent (Before Submitting)

Run the `agents/code-review.md` agent to simulate ObsidianReviewBot's static analysis **before** submitting the PR. This prevents the round-trip of submitting → bot rejects → fixing → re-triggering.

```bash
# Invoke from main context — reads agents/code-review.md and scans the plugin directory
# Prompt: "Run the obsidian-publish code-review agent on <plugin-path>"
```

The agent checks all 25+ `eslint-plugin-obsidianmd` rules (🔴 Required + 🟡 Recommended) and produces a structured report. **Fix all 🔴 Required issues before proceeding to Step 1.**

See `agents/code-review.md` for the full rule set and grep patterns.

---

## Step 1: Run the Readiness Check

Run this from the plugin's root directory:

```bash
python3 /Users/beomsu/Documents/Dev/Obsidian-Plugins/.claude/skills/obsidian-publish/scripts/check-publish-readiness.py
```

The script checks all MUST items deterministically:
- Required files (README.md, LICENSE, manifest.json)
- manifest.json fields, format rules, and **community bot rules**
- Version consistency (manifest == package.json == git tag)
- Code quality (no sample names, no `var`, no `window.app`, no direct `activeLeaf`)
- Platform flag (`isDesktopOnly`) if Node/Electron APIs are used

**Block on any ❌ FAIL.** Fix all failures before proceeding. ⚠️ WARN items are advisory.

---

## Step 2: Ensure a GitHub Release Exists

The community bot checks that the version in `manifest.json` has a corresponding GitHub Release with the required assets.

If you haven't released yet, run from the plugin directory:
```bash
pnpm release:patch   # or minor/major
```

This runs CI → bumps version → pushes tag → GitHub Actions creates the release automatically.

Verify the release has these assets:
- `main.js` ✅ required
- `manifest.json` ✅ required
- `styles.css` optional

⚠️ **Release name format**: The GitHub release title must match the **exact version number** in `manifest.json` — no `v` prefix (e.g. `2.8.5` not `v2.8.5`). Check your release.yml to confirm the title format.

---

## Step 3: Submit the Community PR

Use the automated script to handle the entire PR submission flow:

```bash
python3 /Users/beomsu/Documents/Dev/Obsidian-Plugins/.claude/skills/obsidian-publish/scripts/submit-community-pr.py
```

This script:
1. Reads `manifest.json` for plugin metadata
2. Syncs your fork of `obsidianmd/obsidian-releases` with upstream
3. Creates branch `add-<plugin-id>`
4. Appends your entry at the **end** of `community-plugins.json`
5. Commits and pushes
6. Opens a PR using the exact official template

### If doing it manually:

**3a. Fork the releases repo** (one-time):
```bash
gh repo fork obsidianmd/obsidian-releases --clone=false
```

**3b. Clone and sync your fork:**
```bash
cd /tmp && gh repo clone <your-username>/obsidian-releases
cd obsidian-releases
git remote add upstream https://github.com/obsidianmd/obsidian-releases.git
git fetch upstream && git rebase upstream/master
git push origin master --force
```

**3c. Add your plugin entry at the END:**

```python
import json
plugins = json.loads(open('community-plugins.json').read())
plugins.append({"id": "<plugin-id>", "name": "<Plugin Name>", "author": "<Author>", "description": "<Description ending with period.>", "repo": "<github-username>/<repo-name>"})
open('community-plugins.json', 'w').write(json.dumps(plugins, indent=2) + '\n')
```

> ⚠️ The bot **requires the entry to be at the very end** of the array. Never insert alphabetically.

**3d. Commit, push, open PR:**
```bash
git checkout -b add-<plugin-id>
git add community-plugins.json
git commit -m "Add plugin: <Plugin Name>"
git push origin add-<plugin-id>
gh pr create \
  --repo obsidianmd/obsidian-releases \
  --head <your-username>:add-<plugin-id> \
  --base master \
  --title "Add plugin: <Plugin Name>" \
  --body-file /tmp/pr-body.md
```

The PR body **must use the exact official template** (see `references/pr-template.md`). Use `--body-file` with the template filled in — never compose freehand.

**3e. After submitting:**

The bot validates automatically within minutes. Labels:
- `Ready for review` — passed validation, waiting for human review
- `Validation failed` — fix issues, then push a small change to trigger re-check

To trigger re-check: push any change to the branch (e.g., add/remove a trailing newline).

---

## Step 4: Announce

Once merged, announce in the [Obsidian forum](https://forum.obsidian.md) or Discord `#updates` channel.

---

## ESLint Tooling Health Check

Run this before the code quality checklist. Tooling misconfiguration causes the bot to flag false violations or miss real ones.

```bash
# From the plugin directory
node -e "const p = require('./package.json'); const d = {...p.dependencies,...p.devDependencies}; console.log('eslint:', d.eslint); console.log('eslint-plugin-obsidianmd:', d['eslint-plugin-obsidianmd'] || 'MISSING'); console.log('deprecated @typescript-eslint/eslint-plugin:', d['@typescript-eslint/eslint-plugin'] || 'none'); console.log('deprecated @typescript-eslint/parser:', d['@typescript-eslint/parser'] || 'none');"
```

| Check | Required state | Fix |
|-------|---------------|-----|
| `eslint` version | `^9.x` | Upgrade from `^8.x` — boiler template target is `^9.39.4` |
| `eslint-plugin-obsidianmd` | Present in devDependencies | Add `"eslint-plugin-obsidianmd": "^0.1.9"` |
| `eslint.base.js` obsidianmd import | `import obsidianmd from 'eslint-plugin-obsidianmd'` present | Sync from boiler-template — **package.json alone is not enough** |
| `eslint.base.js` obsidianmd rules | Rules block with `obsidianmd/*` rules present | Sync from boiler-template — without this, bot rejects while local lint passes |
| `@typescript-eslint/eslint-plugin` | **Removed** (deprecated) | Delete from devDependencies — use unified `typescript-eslint` package instead |
| `@typescript-eslint/parser` | **Removed** (deprecated) | Delete from devDependencies — use unified `typescript-eslint` package instead |
| Legacy `.eslintrc.json` | **Deleted** | Remove — conflicts with flat config (`eslint.config.js`) |

After fixing, run `pnpm install && pnpm lint` to verify.

### ✅ eslint.base.js must include obsidianmd rules

Having `eslint-plugin-obsidianmd` in `devDependencies` is NOT enough — the plugin must also be configured in `eslint.base.js`. If the file was synced from an older boiler-template version, it may be missing the obsidianmd rule block entirely.

Check that `eslint.base.js` contains:
```js
import obsidianmd from 'eslint-plugin-obsidianmd'
// ...and a rules block with obsidianmd/* rules in the src/**/*.ts config block
```

If missing, copy the obsidianmd block from `obsidian-boiler-template/tooling/shared/eslint.base.js` and run `pnpm install && pnpm lint`.

**Without this, local lint passes clean while the bot still rejects** — sentence-case, command-name, and settings-heading violations go undetected locally.

---

## Pre-Submission Code Quality Checklist

The **ObsidianReviewBot** performs a static code scan after your PR is submitted. These issues cause `Changes requested` labels and require pushing fixes to the plugin repo. Run through this checklist **before** submitting to avoid the round-trip.

### ✅ Command names — no plugin name prefix
Obsidian automatically prepends the plugin name in the UI. Remove it from `addCommand({ name: ... })`.
```typescript
// ❌ Bad
name: 'QMD: Open search'
// ✅ Good
name: 'Open search'
```

### ✅ Sentence case for all UI text
`setName()`, `setDesc()`, `addButton`, `placeholder`, headings — all sentence case.
```typescript
// ❌ Bad
setting.setName('Server URL').setDesc('The Base URL')
// ✅ Good
setting.setName('Server URL').setDesc('The base URL')
```

### ✅ Section headings via Setting API
Never create `<h2>`/`<h3>` elements directly in settings tabs. Also, headings must NOT be named "General", must NOT contain the plugin name, and must NOT contain the word "settings".
```typescript
// ❌ Bad — HTML element
containerEl.createEl('h2', { text: 'General' })
// ❌ Bad — "General" is explicitly blocked by no-problematic-settings-headings
new Setting(containerEl).setName('General').setHeading()
// ❌ Bad — plugin name in heading
new Setting(containerEl).setName('Eagle plugin settings').setHeading()
// ✅ Good — topic-specific name
new Setting(containerEl).setName('Connection').setHeading()
new Setting(containerEl).setName('Appearance').setHeading()
new Setting(containerEl).setName('Advanced').setHeading()
```

### ✅ No async methods without await
Remove `async` from methods that have no `await` expression inside.
```typescript
// ❌ Bad — async but no await
async onClose(): Promise<void> { this.cleanup(); }
// ✅ Good
onClose(): void { this.cleanup(); }
```
⚠️ **Exception — `ItemView.onOpen/onClose`**: Obsidian's `ItemView` base class declares these as `Promise<void>`, so TypeScript forces `async` even with no `await`. Keep `async` and use `/skip` with reason if the bot flags it.

### ✅ Unhandled promises — add void operator
Float promises must be explicitly acknowledged.
```typescript
// ❌ Bad
someAsyncFn();
// ✅ Good
void someAsyncFn();
```

### ✅ No inline styles — use CSS classes or setCssProps
```typescript
// ❌ Bad
el.style.display = 'none';
el.style.width = '100%';
// ✅ Good
el.addClass('is-hidden');
el.setCssProps({ '--my-width': '100%' });
```

### ✅ Object stringification — no unknown/object in template literals
```typescript
// ❌ Bad — unknown/object in template literal
`Result: ${someUnknown}` // → "[object Object]"
// ✅ Good
`Result: ${String(someUnknown)}`
// For errors:
error instanceof Error ? error.message : String(error)
```

### ✅ No eslint-disable for no-console
The bot runs with `no-console: error` and disallows disabling it. Use a plugin logger instead.
```typescript
// ❌ Bad — Obsidian bot rejects this
// eslint-disable-next-line no-console
console.log('...')
// ✅ Good
this.logger.info('...')  // Use PluginLogger pattern
```

### ✅ vault.configDir not hardcoded .obsidian
```typescript
// ❌ Bad
const configPath = path.join(vaultPath, '.obsidian')
// ✅ Good
const configPath = path.join(vaultPath, this.app.vault.configDir)
```

### ✅ No unnecessary type assertions
```typescript
// ❌ Bad — assertion doesn't change type
const x = value as string;  // if value is already string
// ✅ Good — remove it
const x = value;
```

### ✅ eslint-disable comments need descriptions
```typescript
// ❌ Bad
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// ✅ Good
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party API returns untyped data
```

---

## Community Bot Rules (learned from rejections)

These rules are **not** in the official docs but the bot enforces them:

| Field | Rule |
|-------|------|
| `id` | No `"obsidian"` (per spec) AND no `"plugin"` — bot rejects both |
| `name` | No `"Obsidian"` — redundant and adds clutter |
| `description` | No `"Obsidian"` — same reason |
| `authorUrl` | Must NOT point to the plugin's own GitHub repo |
| Entry position | Must be **last** in `community-plugins.json` |
| PR template | Must use **exact** official template from `.github/PULL_REQUEST_TEMPLATE/plugin.md` |
| Release title | Must match exact version (e.g. `2.8.5` not `v2.8.5`) |

## Quick Reference: All Submission Requirements

| Item | Rule |
|------|------|
| Plugin ID | Unique, no `"obsidian"`, no `"plugin"`, matches manifest.json |
| Plugin name | No `"Obsidian"` |
| Description | No `"Obsidian"`, < 250 chars, ends `.`, no emoji |
| authorUrl | Author profile URL, not the plugin repo URL |
| minAppVersion | Set to minimum compatible Obsidian version |
| isDesktopOnly | `true` if using Node.js / Electron APIs |
| Release assets | `main.js` + `manifest.json` required |
| Release title | Exact version number, no `v` prefix |
| PR title | `Add plugin: <Name>` |
| PR body | Exact official template with checkboxes filled |
| Entry position | Last in `community-plugins.json` |

See `references/pr-template.md` for the exact PR body to use.

---

## Troubleshooting: Bot Rejection Fixes

If the PR gets `Validation failed` label, read the bot's comment and match it below.

| Bot message | Root cause | Fix |
|-------------|-----------|-----|
| `did not follow the pull request template` | PR body doesn't match official template exactly | Re-run `submit-community-pr.py` — it fetches the live template |
| `newly added entry is not at the end` | Entry was inserted alphabetically, not appended | Check `community-plugins.json` — entry must be last; re-run script |
| `id contains "plugin"` | Plugin ID has the word "plugin" | Rename `id` in `manifest.json`, re-release, re-submit |
| `name contains "Obsidian"` | Plugin name includes "Obsidian" | Rename in `manifest.json` (e.g. "Obsidian Note Player" → "Note Player") |
| `description contains "Obsidian"` | Description mentions "Obsidian" | Rephrase: use "your vault" or "your notes" instead |
| `authorUrl points to plugin repo` | `authorUrl` is the plugin's own GitHub URL | Change to your author profile URL (e.g. `https://github.com/YourUser`) |
| Release not found / wrong version | GitHub release name has `v` prefix or doesn't exist | Verify release title is `2.8.5` not `v2.8.5`; check `release.yml` |

### After fixing, re-trigger bot validation

The bot re-validates whenever a new commit is pushed to the PR branch:

```bash
# From inside the obsidian-releases fork directory
cd /tmp/obsidian-releases
git checkout add-<plugin-id>
git commit --allow-empty -m "re-trigger validation"
git push origin add-<plugin-id>
```

Or just re-run the full `submit-community-pr.py` script — it force-pushes and handles everything.

---

## Troubleshooting: ObsidianReviewBot Code Issues

If the PR gets `Changes requested` from **ObsidianReviewBot**, these are code-level violations in the plugin repo. Fix them there and push — the bot rescans within 6 hours, or sooner if you push a new commit.

| Bot message | Root cause | Fix |
|-------------|-----------|-----|
| `command name should not include the plugin name` / `The command name should not include the plugin name` | `addCommand({ name: 'PluginName: Do thing' })` | Remove prefix: `name: 'Do thing'` |
| `The command ID should not include the plugin ID` | `addCommand({ id: 'plugin-id-foo' })` | Strip plugin ID prefix: `id: 'foo'` |
| `Use sentence case for UI text` | Title Case in `setName/setDesc/placeholder` | Convert to sentence case |
| `use new Setting().setHeading() instead of HTML elements` | `containerEl.createEl('h2', ...)` in settings | Replace with `new Setting(el).setName('...').setHeading()` |
| `Avoid using "settings" in settings headings` | Heading text contains the word "settings" | Rename to topic: "Appearance", "Advanced", "Connection" (NOT "General" — also rejected) |
| `Avoid using "General" as a heading in settings` | `setName('General').setHeading()` is explicitly blocked by `no-problematic-settings-headings` | Use topic-specific names: "Connection", "Appearance", "Advanced", "Sync" |
| `Avoid including the plugin name in settings headings` | Heading text contains the plugin name | Remove plugin name from heading text |
| `Async method 'X' has no 'await' expression` (simple body) | Method declared `async` but body has no `await` | Remove `async` keyword (and change return type to `void`). **Exception**: `ItemView.onOpen/onClose` must stay `async` — use `/skip` with explanation |
| `Async method 'X' has no 'await' expression` (delegate pass-through) | `async doThing() { return this.service.doThing(); }` — method just forwards to another async method without awaiting | Remove `async`; the returned Promise propagates automatically without it |
| `Async method 'X' has no 'await' expression` (base class stub) | `async init(): Promise<void> {}` — empty body in a base class or abstract-style method | Replace body with `return Promise.resolve();` — empty `async` bodies trigger the rule even though they compile fine |
| `Promises must be awaited... or marked with void` | Floating promise call | Add `void` operator: `void someAsync()` |
| `Unexpected console statement. Only these console methods are allowed: warn, error, debug.` | `console.info` or `console.log` in source | Replace with `console.debug`, `console.warn`, or `console.error` |
| `Disabling no-console is not allowed` | `eslint-disable no-console` directive | Remove directive; replace `console.*` with plugin logger |
| `Unexpected undescribed directive comment` | Bare `// eslint-disable-next-line rule-name` with no ` -- reason` | Append ` -- <reason>` to every eslint-disable comment |
| `Unused eslint-disable directive` | Stale eslint-disable left after refactor | Remove the directive entirely |
| `will use Object's default stringification format` | Unknown/object in template literal | Wrap with `String()` or extract `.message` for errors |
| `Avoid setting styles directly via element.style` | Inline style assignment | Use `addClass/removeClass` or `setCssProps` |
| `Unexpected any. Specify a different type.` | `any` type annotation in source | Replace with `unknown`, a specific type, or an interface. **The eslint-disable directive for this rule is also banned** — cannot suppress, must fix. For custom workspace events use module augmentation in `src/types/obsidian-augments.d.ts`. For private shapes use `as unknown as { field?: T }`. |
| `Use Vault#configDir instead of .obsidian` | Hardcoded `.obsidian` path | Replace with `this.app.vault.configDir` |
| `This assertion is unnecessary` | `as Type` when type already matches | Remove the type assertion |
| `` `config` is deprecated `` | `tseslint.config(...)` in `eslint.config.js` | ⚠️ **False positive** — `tseslint.defineConfig()` does not exist in typescript-eslint 8.x. Use `/skip` with: "tseslint.defineConfig() does not exist in typescript-eslint 8.x — tseslint.config() is the only available API" |

---

## Bot-Specific Manual Checklist (after `pnpm lint` passes)

These rules are **not reliably caught by local `pnpm lint`** but the ObsidianReviewBot enforces them. Run through this checklist manually after lint is clean.

| Check | What to grep for | Fix |
|-------|-----------------|-----|
| Only `warn/error/debug` console methods | `grep -rn 'console\.info\|console\.log' src/` | Replace with `console.debug`, `console.warn`, or `console.error` |
| `eslint-disable` directives have `-- reason` | `grep -rn 'eslint-disable' src/ \| grep -v ' -- '` | Append ` -- <reason>` to every directive; bare directives are rejected |
| No `eslint-disable no-console` ever | `grep -rn 'disable.*no-console' src/` | Remove directive entirely; use plugin logger instead |
| Object in template literal uses `String()` | `grep -rn '`\${' src/` — look for non-primitive variables | Wrap with `String(value)` or use `error instanceof Error ? error.message : String(error)` |

**Why these escape local lint**: console method rules and disable-description checks are configured differently in the bot's ESLint environment. Even a correctly configured `eslint.base.js` may not reproduce the exact bot ruleset for these edge cases.
