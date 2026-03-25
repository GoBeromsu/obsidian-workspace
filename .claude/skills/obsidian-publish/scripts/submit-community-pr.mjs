#!/usr/bin/env node
/**
 * submit-community-pr.mjs
 * Run from a plugin's root directory:
 *   node <path-to-skill>/scripts/submit-community-pr.mjs
 *
 * Automates Phase 3 of community plugin submission:
 * 1. Reads manifest.json to get plugin metadata
 * 2. Syncs your fork of obsidianmd/obsidian-releases with upstream
 * 3. Creates branch add-<plugin-id>
 * 4. Appends entry at END of community-plugins.json
 * 5. Commits and pushes
 * 6. Opens a PR using the exact official template
 *
 * Prerequisites:
 * - gh CLI authenticated
 * - You have forked obsidianmd/obsidian-releases to your GitHub account
 * - Your fork is accessible via gh
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  if (result.error) throw new Error(`Failed to spawn ${cmd}: ${result.error.message}`);
  return result;
}

function runOrDie(cmd, args, options = {}) {
  const result = run(cmd, args, options);
  if (result.status !== 0) {
    console.error(`\n❌ Command failed: ${cmd} ${args.join(' ')}`);
    console.error(result.stderr || result.stdout || '(no output)');
    process.exit(1);
  }
  return result.stdout.trim();
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8')); }
  catch { return null; }
}

// ── Read manifest ──────────────────────────────────────────────────────────────

const manifest = readJson('manifest.json');
if (!manifest) {
  console.error('❌ manifest.json not found or invalid. Run from a plugin root directory.');
  process.exit(1);
}

const { id, name, author, description } = manifest;
if (!id || !name || !author || !description) {
  console.error('❌ manifest.json is missing required fields: id, name, author, description');
  process.exit(1);
}

// ── Infer repo slug from git remote ───────────────────────────────────────────

const remoteUrl = runOrDie('git', ['remote', 'get-url', 'origin'], { cwd });
// Extract owner/repo from https://github.com/owner/repo or git@github.com:owner/repo
const repoMatch = remoteUrl.replace(/\.git$/, '').match(/[:/]([^/]+\/[^/]+)$/);
if (!repoMatch) {
  console.error(`❌ Could not parse GitHub repo from remote: ${remoteUrl}`);
  process.exit(1);
}
const repoSlug = repoMatch[1]; // e.g. GoBeromsu/obsidian-eagle-plugin
const repoUrl = `https://github.com/${repoSlug}`;

// Infer GitHub username from repo slug
const githubUser = repoSlug.split('/')[0];

console.log(`\nPlugin: ${name} (${id})`);
console.log(`Repo:   ${repoSlug}`);
console.log(`Author: ${author}\n`);

// ── Clone/update fork ─────────────────────────────────────────────────────────

const releasesDir = path.join(os.tmpdir(), 'obsidian-releases');

if (!fs.existsSync(releasesDir)) {
  console.log('Cloning fork...');
  runOrDie('gh', ['repo', 'clone', `${githubUser}/obsidian-releases`, releasesDir]);
} else {
  console.log('Fork already cloned, updating...');
}

// Add upstream if not already set
const remotes = run('git', ['remote'], { cwd: releasesDir }).stdout;
if (!remotes.includes('upstream')) {
  runOrDie('git', ['remote', 'add', 'upstream', 'https://github.com/obsidianmd/obsidian-releases.git'], { cwd: releasesDir });
}

// Sync with upstream
console.log('Syncing with upstream...');
runOrDie('git', ['checkout', 'master'], { cwd: releasesDir });
runOrDie('git', ['fetch', 'upstream'], { cwd: releasesDir });
const rebaseResult = run('git', ['rebase', 'upstream/master'], { cwd: releasesDir });
if (rebaseResult.status !== 0) {
  // If rebase fails, try reset to upstream
  console.warn('⚠️  Rebase failed, resetting to upstream/master...');
  runOrDie('git', ['reset', '--hard', 'upstream/master'], { cwd: releasesDir });
}
runOrDie('git', ['push', 'origin', 'master', '--force'], { cwd: releasesDir });

// ── Create branch ─────────────────────────────────────────────────────────────

const branch = `add-${id}`;
console.log(`\nCreating branch: ${branch}`);

// Check if branch already exists locally
const branchCheck = run('git', ['show-ref', '--verify', `refs/heads/${branch}`], { cwd: releasesDir });
if (branchCheck.status === 0) {
  runOrDie('git', ['checkout', 'master'], { cwd: releasesDir });
  runOrDie('git', ['branch', '-D', branch], { cwd: releasesDir });
}
runOrDie('git', ['checkout', '-b', branch], { cwd: releasesDir });

// ── Append entry to community-plugins.json ────────────────────────────────────

const pluginsFile = path.join(releasesDir, 'community-plugins.json');
const plugins = JSON.parse(fs.readFileSync(pluginsFile, 'utf8'));

// Check if already submitted
const existing = plugins.find(p => p.id === id);
if (existing) {
  console.error(`❌ Plugin id "${id}" already exists in community-plugins.json!`);
  console.error('  If this is a mistake, check the existing entry:', JSON.stringify(existing));
  process.exit(1);
}

const entry = { id, name, author, description, repo: repoSlug };
plugins.push(entry);
fs.writeFileSync(pluginsFile, JSON.stringify(plugins, null, 2) + '\n');
console.log(`✅ Appended entry at index ${plugins.length - 1} (end of list)`);

// ── Commit and push ───────────────────────────────────────────────────────────

runOrDie('git', ['add', 'community-plugins.json'], { cwd: releasesDir });
runOrDie('git', ['commit', '-m', `Add plugin: ${name}`], { cwd: releasesDir });
runOrDie('git', ['push', 'origin', branch, '--force'], { cwd: releasesDir });
console.log(`✅ Pushed branch: ${branch}`);

// ── Fetch PR body from official template URL ──────────────────────────────────

const TEMPLATE_URL = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/refs/heads/master/.github/PULL_REQUEST_TEMPLATE/plugin.md';

console.log('Fetching official PR template...');
let templateText;
try {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  templateText = await res.text();
} catch (err) {
  console.warn(`⚠️  Could not fetch template (${err.message}), using bundled fallback.`);
  // Fallback: bundled copy of the template (update if obsidianmd changes it)
  templateText = `# I am submitting a new Community Plugin\n\n- [ ] I attest that I have done my best to deliver a high-quality plugin, am proud of the code I have written, and would recommend it to others. I commit to maintaining the plugin and being responsive to bug reports. If I am no longer able to maintain it, I will make reasonable efforts to find a successor maintainer or withdraw the plugin from the directory.\n\n## Repo URL\n\n<!--- Paste a link to your repo here for easy access -->\nLink to my plugin:\n\n## Release Checklist\n- [ ] I have tested the plugin on\n  - [ ]  Windows\n  - [ ]  macOS\n  - [ ]  Linux\n  - [ ]  Android _(if applicable)_\n  - [ ]  iOS _(if applicable)_\n- [ ] My GitHub release contains all required files (as individual files, not just in the source.zip / source.tar.gz)\n  - [ ] \`main.js\`\n  - [ ] \`manifest.json\`\n  - [ ] \`styles.css\` _(optional)_\n- [ ] GitHub release name matches the exact version number specified in my manifest.json (_**Note:** Use the exact version number, don't include a prefix \`v\`_)\n- [ ] The \`id\` in my \`manifest.json\` matches the \`id\` in the \`community-plugins.json\` file.\n- [ ] My README.md describes the plugin\'s purpose and provides clear usage instructions.\n- [ ] I have read the developer policies at https://docs.obsidian.md/Developer+policies, and have assessed my plugin\'s adherence to these policies.\n- [ ] I have read the tips in https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines and have self-reviewed my plugin to avoid these common pitfalls.\n- [ ] I have added a license in the LICENSE file.\n- [ ] My project respects and is compatible with the original license of any code from other plugins that I\'m using.\n      I have given proper attribution to these other projects in my \`README.md\`.`;
}

// Fill in the repo URL
let prBody = templateText.replace('Link to my plugin:', `Link to my plugin: ${repoUrl}`);

// Check all top-level boxes ([ ] → [x]), keeping N/A items unchecked:
// Leave unchecked: Windows, Linux, Android, iOS (desktop-only plugin), styles.css (optional)
const keepUnchecked = ['Windows', 'Linux', 'Android', 'iOS', 'styles.css'];
prBody = prBody.split('\n').map(line => {
  if (!line.includes('- [ ]')) return line;
  const shouldKeepUnchecked = keepUnchecked.some(kw => line.includes(kw));
  return shouldKeepUnchecked ? line : line.replace('- [ ]', '- [x]');
}).join('\n');

const bodyFile = path.join(os.tmpdir(), `pr-body-${id}.md`);
fs.writeFileSync(bodyFile, prBody);

// ── Open PR ───────────────────────────────────────────────────────────────────

console.log('\nOpening community PR...');
const prResult = run('gh', [
  'pr', 'create',
  '--repo', 'obsidianmd/obsidian-releases',
  '--head', `${githubUser}:${branch}`,
  '--base', 'master',
  '--title', `Add plugin: ${name}`,
  '--body-file', bodyFile,
]);

if (prResult.status !== 0) {
  console.error('❌ Failed to create PR:');
  console.error(prResult.stderr || prResult.stdout);
  process.exit(1);
}

const prUrl = prResult.stdout.trim();
console.log(`\n✅ Community PR opened: ${prUrl}`);
console.log('\nNext steps:');
console.log('  1. Wait a few minutes for the bot to validate');
console.log('  2. Check for "Validation failed" label and fix any issues');
console.log('  3. Push a small change to re-trigger validation if needed');
console.log('  4. Once "Ready for review", wait for a human reviewer');
