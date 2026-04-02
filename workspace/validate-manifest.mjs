#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const requiredPluginFields = [
  'name',
  'repo_path',
  'repo_kind',
  'git_branch',
  'plugin_id',
  'portfolio_role',
  'release_kind',
  'artifact_files',
  'ci_workflow',
  'release_workflow',
  'smoke_vault',
  'smoke_commands',
  'risk_tier',
];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readManifest() {
  const manifestPath = path.resolve(process.cwd(), 'workspace/plugins.manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function validatePlugin(plugin, seenPaths) {
  for (const field of requiredPluginFields) {
    if (!(field in plugin)) {
      fail(`${plugin.name ?? '<unknown>'}: missing required field "${field}"`);
    }
  }

  if (!isNonEmptyString(plugin.repo_path)) {
    fail(`${plugin.name}: repo_path must be a non-empty string`);
  }

  if (seenPaths.has(plugin.repo_path)) {
    fail(`${plugin.name}: duplicate repo_path "${plugin.repo_path}"`);
  }
  seenPaths.add(plugin.repo_path);

  if (!['submodule', 'root-local'].includes(plugin.repo_kind)) {
    fail(`${plugin.name}: repo_kind must be "submodule" or "root-local"`);
  }

  if (!['stable', 'beta', 'incubator'].includes(plugin.release_kind)) {
    fail(`${plugin.name}: release_kind must be stable, beta, or incubator`);
  }

  if (!Array.isArray(plugin.artifact_files) || plugin.artifact_files.length === 0) {
    fail(`${plugin.name}: artifact_files must be a non-empty array`);
  }

  if (!Array.isArray(plugin.smoke_commands) || plugin.smoke_commands.length === 0) {
    fail(`${plugin.name}: smoke_commands must be a non-empty array`);
  }

  const absoluteRepoPath = path.resolve(process.cwd(), plugin.repo_path);
  if (!fs.existsSync(absoluteRepoPath)) {
    fail(`${plugin.name}: repo_path does not exist: ${plugin.repo_path}`);
  }

  if (plugin.repo_kind === 'root-local' && plugin.release_kind !== 'incubator') {
    fail(`${plugin.name}: root-local portfolio members must remain incubator until promoted`);
  }

  if (plugin.repo_kind === 'submodule' && !isNonEmptyString(plugin.repo_slug)) {
    fail(`${plugin.name}: submodule portfolio members require repo_slug`);
  }
}

const manifest = readManifest();
if (manifest.workspace_kind !== 'submodule-workspace') {
  fail('workspace_kind must be "submodule-workspace"');
}

if (!Array.isArray(manifest.plugins) || manifest.plugins.length === 0) {
  fail('plugins.manifest.json must contain a non-empty plugins array');
} else {
  const seenPaths = new Set();
  for (const plugin of manifest.plugins) {
    validatePlugin(plugin, seenPaths);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`Manifest valid: ${manifest.plugins.length} plugin entries`);
