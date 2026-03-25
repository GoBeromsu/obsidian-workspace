#!/usr/bin/env node
/**
 * check-publish-readiness.mjs
 * Run from a plugin's root directory: node <path-to-skill>/scripts/check-publish-readiness.mjs
 *
 * Exits 0 if all MUST checks pass, 1 if any FAIL.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const results = [];

function pass(group, label) { results.push({ group, label, status: 'PASS' }); }
function fail(group, label, hint) { results.push({ group, label, status: 'FAIL', hint }); }
function warn(group, label, hint) { results.push({ group, label, status: 'WARN', hint }); }

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8')); }
  catch { return null; }
}

function fileExists(file) {
  try { return fs.statSync(path.join(cwd, file)).size > 0; }
  catch { return false; }
}

/** Walk src/ and return lines matching the regex pattern. */
function grepSrc(pattern, flags = '') {
  const regex = new RegExp(pattern, flags);
  const srcDir = path.join(cwd, 'src');
  if (!fs.existsSync(srcDir)) return '';
  const hits = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue;
      const content = fs.readFileSync(full, 'utf8');
      for (const [i, line] of content.split('\n').entries()) {
        if (regex.test(line)) hits.push(`${path.relative(cwd, full)}:${i + 1}: ${line.trim()}`);
      }
    }
  }
  walk(srcDir);
  return hits.join('\n');
}

function hasEmoji(str) {
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(str);
}

function isSemver(v) {
  return /^\d+\.\d+\.\d+$/.test(v);
}

// ── Group 1: Required files ───────────────────────────────────────────────────

const G_FILES = 'Required Files';

if (fileExists('README.md')) pass(G_FILES, 'README.md exists');
else fail(G_FILES, 'README.md exists', 'Create a README.md describing the plugin purpose and usage');

if (fileExists('LICENSE')) pass(G_FILES, 'LICENSE exists');
else fail(G_FILES, 'LICENSE exists', 'Choose a license at choosealicense.com and add a LICENSE file');

const manifest = readJson('manifest.json');
if (manifest) pass(G_FILES, 'manifest.json is valid JSON');
else fail(G_FILES, 'manifest.json is valid JSON', 'manifest.json is missing or contains invalid JSON');

// ── Group 2: manifest.json fields ────────────────────────────────────────────

const G_MANIFEST = 'manifest.json';

if (manifest) {
  for (const field of ['id', 'name', 'author', 'version', 'minAppVersion', 'description']) {
    if (manifest[field] !== undefined && manifest[field] !== '')
      pass(G_MANIFEST, `"${field}" is set`);
    else
      fail(G_MANIFEST, `"${field}" is set`, `Add "${field}" to manifest.json`);
  }

  if (manifest.id) {
    if (/obsidian/i.test(manifest.id))
      fail(G_MANIFEST, 'Plugin ID does not contain "obsidian"', `Current id: "${manifest.id}" — rename it`);
    else
      pass(G_MANIFEST, 'Plugin ID does not contain "obsidian"');

    if (/plugin/i.test(manifest.id))
      fail(G_MANIFEST, 'Plugin ID does not contain "plugin"', `Current id: "${manifest.id}" — bot rejects "plugin" in ID (e.g. use "eagle" not "eagle-plugin")`);
    else
      pass(G_MANIFEST, 'Plugin ID does not contain "plugin"');
  }

  if (manifest.name) {
    if (/obsidian/i.test(manifest.name))
      fail(G_MANIFEST, 'Plugin name does not contain "Obsidian"', `Current name: "${manifest.name}" — redundant, adds clutter to the plugin list`);
    else
      pass(G_MANIFEST, 'Plugin name does not contain "Obsidian"');
  }

  if (manifest.authorUrl && pkg) {
    // authorUrl must not point to the plugin's own repo
    const remoteResult = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', cwd });
    if (remoteResult.status === 0) {
      const repoName = remoteResult.stdout.trim().replace(/\.git$/, '').split('/').pop();
      if (manifest.authorUrl.includes(repoName))
        fail(G_MANIFEST, 'authorUrl does not point to the plugin repo', `"${manifest.authorUrl}" points to this plugin's repo — use your author profile URL instead`);
      else
        pass(G_MANIFEST, 'authorUrl does not point to the plugin repo');
    }
  }

  if (manifest.description) {
    const desc = manifest.description;

    if (desc.length < 250) pass(G_MANIFEST, 'Description < 250 chars');
    else fail(G_MANIFEST, 'Description < 250 chars', `Current length: ${desc.length}`);

    if (desc.trimEnd().endsWith('.')) pass(G_MANIFEST, 'Description ends with "."');
    else fail(G_MANIFEST, 'Description ends with "."', 'Add a period at the end');

    if (!hasEmoji(desc)) pass(G_MANIFEST, 'Description has no emoji');
    else fail(G_MANIFEST, 'Description has no emoji', 'Remove emoji from description');

    if (!/^this is a plugin/i.test(desc.trim())) pass(G_MANIFEST, 'Description does not start with "This is a plugin"');
    else fail(G_MANIFEST, 'Description does not start with "This is a plugin"', 'Rewrite to start with an action verb e.g. "Searches...", "Generates..."');

    if (!/obsidian/i.test(desc)) pass(G_MANIFEST, 'Description does not contain "Obsidian"');
    else fail(G_MANIFEST, 'Description does not contain "Obsidian"', `Bot rejects "Obsidian" in description — rephrase using "your vault" or "your notes"`);
  }

  if (manifest.version && isSemver(manifest.version)) pass(G_MANIFEST, 'version follows semver (x.y.z)');
  else fail(G_MANIFEST, 'version follows semver (x.y.z)', `Current: "${manifest.version}"`);

  if (manifest.fundingUrl !== undefined)
    warn(G_MANIFEST, 'fundingUrl present', 'Remove fundingUrl if you are not accepting donations');
}

// ── Group 3: Version consistency ─────────────────────────────────────────────

const G_VERSION = 'Version Consistency';

const pkg = readJson('package.json');
if (manifest && pkg) {
  if (manifest.version === pkg.version) pass(G_VERSION, 'manifest.json version == package.json version');
  else fail(G_VERSION, 'manifest.json version == package.json version',
    `manifest: ${manifest.version}, package.json: ${pkg.version}`);
}

if (manifest) {
  const result = spawnSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf8', cwd });
  if (result.status === 0) {
    const tag = result.stdout.trim();
    const expected = manifest.version;
    if (tag === expected || tag === `v${expected}`) pass(G_VERSION, `Latest git tag matches version (${tag})`);
    else warn(G_VERSION, 'Latest git tag matches version', `Tag is "${tag}", expected "${expected}" — run pnpm release:* first`);

    // Warn if tag has v prefix — GitHub release title must match exact version without v
    if (tag.startsWith('v')) {
      warn(G_VERSION, 'GitHub release title must not have "v" prefix',
        `Tag is "${tag}" — verify your GitHub release is titled "${tag.slice(1)}" (not "${tag}"). Check release.yml.`);
    }
  } else {
    warn(G_VERSION, 'Latest git tag matches version', 'No git tag found — run pnpm release:* to create one before submitting');
  }
}

// ── Group 4: Code quality ─────────────────────────────────────────────────────

const G_CODE = 'Code Quality';

const sampleNames = grepSrc('\\b(MyPlugin|SampleSettingTab|MyPluginSettings)\\b');
if (sampleNames) fail(G_CODE, 'No sample class names (MyPlugin, SampleSettingTab, etc.)', `Found:\n${sampleNames}`);
else pass(G_CODE, 'No sample class names');

const varDecls = grepSrc('\\bvar ');
if (varDecls) fail(G_CODE, 'No var declarations (use const/let)', `Found:\n${varDecls}`);
else pass(G_CODE, 'No var declarations');

const globalApp = grepSrc('(window\\.app|global\\.app)');
if (globalApp) fail(G_CODE, 'No window.app / global.app (use this.app)', `Found:\n${globalApp}`);
else pass(G_CODE, 'No window.app / global.app');

const activeLeaf = grepSrc('workspace\\.activeLeaf[^s]');
if (activeLeaf) fail(G_CODE, 'No direct workspace.activeLeaf access', `Use getActiveViewOfType() instead:\n${activeLeaf}`);
else pass(G_CODE, 'No direct workspace.activeLeaf access');

// ── Group 6: Bot Code Rules ───────────────────────────────────────────────────

const G_BOT = 'Bot Code Rules';

const consoleInfo = grepSrc('console\\.info\\s*\\(');
if (consoleInfo) fail(G_BOT, 'No console.info (use console.debug/warn/error)', `Found:\n${consoleInfo}`);
else pass(G_BOT, 'No console.info usage');

const undescribedDisable = grepSrc('eslint-disable(?!.*--)');
if (undescribedDisable) fail(G_BOT, 'eslint-disable comments have descriptions', `Found (missing -- reason):\n${undescribedDisable}`);
else pass(G_BOT, 'All eslint-disable comments have descriptions');

if (manifest) {
  const pluginId = manifest.id ?? '';
  const addCommandSrc = grepSrc('addCommand\\s*\\(');
  if (addCommandSrc) {
    const idWithPluginId = grepSrc(`id:\\s*['"\`]${pluginId}[-_]`);
    if (idWithPluginId) fail(G_BOT, 'Command ID does not include plugin ID', `Found:\n${idWithPluginId}`);
    else pass(G_BOT, 'Command ID does not include plugin ID');

    const pluginNameLower = (manifest.name ?? '').replace(/\s+/g, '\\s+');
    const nameWithPluginName = pluginNameLower ? grepSrc(`name:\\s*['"\`]${pluginNameLower}[:\\s]`, 'i') : '';
    if (nameWithPluginName) fail(G_BOT, 'Command name does not include plugin name', `Found:\n${nameWithPluginName}`);
    else pass(G_BOT, 'Command name does not include plugin name');
  }
}

const settingsHeadingSettings = grepSrc("setHeading.*settings|setName.*'[^']*[Ss]ettings[^']*'.*setHeading|setHeading.*setName.*'[^']*[Ss]ettings", 'i');
if (settingsHeadingSettings) warn(G_BOT, 'Settings headings avoid "settings" keyword', `Found:\n${settingsHeadingSettings}`);
else pass(G_BOT, 'Settings headings do not contain "settings"');

const eslintConfigJs = path.join(cwd, 'eslint.config.js');
const eslintConfigMjs = path.join(cwd, 'eslint.config.mjs');
for (const cfgPath of [eslintConfigJs, eslintConfigMjs]) {
  if (fs.existsSync(cfgPath)) {
    const cfgContent = fs.readFileSync(cfgPath, 'utf8');
    if (/tseslint\.config\s*\(/.test(cfgContent) && !/tseslint\.defineConfig\s*\(/.test(cfgContent)) {
      fail(G_BOT, 'eslint.config uses defineConfig() not deprecated config()', `${path.basename(cfgPath)}: replace tseslint.config() with tseslint.defineConfig()`);
    } else {
      pass(G_BOT, 'eslint.config uses defineConfig()');
    }
    break;
  }
}

// ── Group 5: Platform ─────────────────────────────────────────────────────────

const G_PLATFORM = 'Platform';

if (manifest) {
  const nodeApis = grepSrc("require\\(['\"](?:fs|path|os|child_process|crypto)['\"]\\)|\\bprocess\\.env\\b|\\belectron\\b");
  if (nodeApis) {
    if (manifest.isDesktopOnly === true) pass(G_PLATFORM, 'isDesktopOnly=true (Node/Electron APIs detected)');
    else fail(G_PLATFORM, 'isDesktopOnly=true required', `Node/Electron API usage detected but isDesktopOnly is not true:\n${nodeApis}`);
  } else {
    pass(G_PLATFORM, 'No Node/Electron API usage detected');
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

const icons = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ' };
const groups = [...new Set(results.map(r => r.group))];

console.log('\n=== Obsidian Publish Readiness Check ===\n');

let anyFail = false;
for (const group of groups) {
  console.log(`── ${group}`);
  for (const r of results.filter(r => r.group === group)) {
    console.log(`  ${icons[r.status]} ${r.label}`);
    if (r.hint && r.status !== 'PASS') {
      for (const line of r.hint.split('\n')) console.log(`       ${line}`);
    }
    if (r.status === 'FAIL') anyFail = true;
  }
  console.log('');
}

const failCount = results.filter(r => r.status === 'FAIL').length;
const warnCount = results.filter(r => r.status === 'WARN').length;
const passCount = results.filter(r => r.status === 'PASS').length;

console.log(`Result: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);

if (anyFail) {
  console.log('\n❌ Plugin is NOT ready for community submission. Fix all FAIL items above.\n');
  process.exit(1);
} else {
  console.log('\n✅ All MUST checks passed. Proceed with community submission.\n');
  process.exit(0);
}
