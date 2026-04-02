#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const options = {
    manifest: 'workspace/plugins.manifest.json',
    markdownOut: '.artifacts/release-readiness.md',
    jsonOut: '.artifacts/release-readiness.json',
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest') options.manifest = argv[++i];
    else if (arg === '--markdown-out') options.markdownOut = argv[++i];
    else if (arg === '--json-out') options.jsonOut = argv[++i];
    else if (arg === '--strict') options.strict = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) return { ok: false, stdout: '', stderr: result.error.message };
  if ((result.status ?? 1) !== 0) {
    return { ok: false, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }
  return { ok: true, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function getSubmoduleShaMap() {
  const map = new Map();
  const result = run('git', ['submodule', 'status']);
  if (!result.ok) return map;
  for (const line of result.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [, sha, repoPath] = trimmed.match(/^[- +]?([0-9a-f]+)\s+(\S+)/) ?? [];
    if (sha && repoPath) {
      map.set(repoPath, sha);
    }
  }
  return map;
}

function getLatestWorkflow(repoSlug, workflowName) {
  if (!repoSlug) return { state: 'not_applicable' };
  const result = run('gh', [
    'run',
    'list',
    '-R',
    repoSlug,
    '-L',
    '20',
    '--json',
    'workflowName,status,conclusion,event,headBranch,url',
  ]);

  if (!result.ok) {
    return { state: 'unknown', reason: 'gh query failed' };
  }

  const runs = JSON.parse(result.stdout);
  const match = runs.find((runEntry) => runEntry.workflowName === workflowName);
  if (!match) {
    return { state: 'unknown', reason: 'workflow not found in latest runs' };
  }

  return {
    state: match.conclusion === 'success' ? 'passing' : 'failing',
    status: match.status,
    conclusion: match.conclusion,
    url: match.url,
    headBranch: match.headBranch,
    event: match.event,
  };
}

function evaluatePlugin(plugin, submoduleShas) {
  const issues = [];
  const repoExists = fs.existsSync(path.resolve(process.cwd(), plugin.repo_path));
  if (!repoExists) issues.push('repo_path_missing');

  if (plugin.repo_kind === 'root-local' && plugin.release_kind !== 'incubator') {
    issues.push('root_local_releaseable_plugin');
  }

  if (!Array.isArray(plugin.artifact_files) || plugin.artifact_files.length === 0) {
    issues.push('missing_artifact_contract');
  }

  if (!Array.isArray(plugin.smoke_commands) || plugin.smoke_commands.length === 0) {
    issues.push('missing_smoke_contract');
  }

  const ci = getLatestWorkflow(plugin.repo_slug, plugin.ci_workflow);
  const release = getLatestWorkflow(plugin.repo_slug, plugin.release_workflow);
  const sha = plugin.repo_kind === 'submodule' ? submoduleShas.get(plugin.repo_path) ?? null : null;

  if (plugin.release_kind !== 'incubator' && ci.state !== 'passing') {
    issues.push('ci_not_green');
  }

  const status =
    plugin.release_kind === 'incubator'
      ? 'incubator'
      : issues.length === 0
        ? 'ready'
        : 'blocked';

  return {
    name: plugin.name,
    repo_path: plugin.repo_path,
    repo_kind: plugin.repo_kind,
    plugin_id: plugin.plugin_id,
    release_kind: plugin.release_kind,
    risk_tier: plugin.risk_tier,
    submodule_sha: sha,
    ci,
    release,
    status,
    issues,
  };
}

function toMarkdown(manifest, report) {
  const lines = [
    '# Release Readiness Report',
    '',
    `- Workspace kind: \`${manifest.workspace_kind}\``,
    `- Generated at: \`${new Date().toISOString()}\``,
    '',
    '| Plugin | Status | Release kind | CI | Release workflow | Issues |',
    '|--------|--------|--------------|----|------------------|--------|',
  ];

  for (const item of report) {
    const ci = item.ci.conclusion ?? item.ci.state ?? 'unknown';
    const release = item.release.conclusion ?? item.release.state ?? 'unknown';
    const issues = item.issues.length > 0 ? item.issues.join(', ') : '—';
    lines.push(
      `| ${item.name} | \`${item.status}\` | \`${item.release_kind}\` | \`${ci}\` | \`${release}\` | ${issues} |`,
    );
  }

  lines.push('', '## Notes', '');
  lines.push('- This is a report-only gate. It does not block release publication yet.');
  lines.push('- Incubators are reported but not treated as releasable portfolio members.');
  lines.push('- A future strict mode should fail on blocked stable/beta plugins.');
  return `${lines.join('\n')}\n`;
}

const options = parseArgs(process.argv.slice(2));
const manifest = readJson(path.resolve(process.cwd(), options.manifest));
const submoduleShas = getSubmoduleShaMap();
const report = manifest.plugins.map((plugin) => evaluatePlugin(plugin, submoduleShas));

fs.mkdirSync(path.dirname(path.resolve(process.cwd(), options.markdownOut)), { recursive: true });
fs.mkdirSync(path.dirname(path.resolve(process.cwd(), options.jsonOut)), { recursive: true });
fs.writeFileSync(path.resolve(process.cwd(), options.markdownOut), toMarkdown(manifest, report));
fs.writeFileSync(path.resolve(process.cwd(), options.jsonOut), `${JSON.stringify(report, null, 2)}\n`);

if (options.strict && report.some((item) => item.status === 'blocked')) {
  console.error('Blocked release candidates detected');
  process.exit(1);
}

console.log(`Generated release readiness report for ${report.length} plugins`);
