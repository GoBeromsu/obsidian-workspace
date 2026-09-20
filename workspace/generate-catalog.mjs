#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve(process.cwd(), 'workspace/plugins.manifest.json');
const outputPath = path.resolve(process.cwd(), 'docs/workspace-catalog.md');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function formatList(items) {
  if (!Array.isArray(items) || items.length === 0) return '—';
  return items.map((item) => `\`${item}\``).join(', ');
}

function formatInstall(plugin) {
  if (plugin.install_channel === 'none') return '—';
  const label = plugin.install_channel === 'community' ? 'Community store' : plugin.install_channel;
  return plugin.release_url ? `[${label}](${plugin.release_url})` : label;
}

function buildCatalog(manifest) {
  const lines = [
    '# Workspace Catalog',
    '',
    '> Generated from `workspace/plugins.manifest.json`. Edit the manifest, then rerun `node workspace/generate-catalog.mjs`.',
    '',
    `- Workspace kind: \`${manifest.workspace_kind}\``,
    `- Manifest version: \`${manifest.manifest_version}\``,
    '',
    '## Portfolio',
    '',
    '| Name | Path | Role | Install | Release kind | Branch | Risk | Smoke vault |',
    '|------|------|------|---------|--------------|--------|------|-------------|',
  ];

  for (const plugin of manifest.plugins) {
    lines.push(
      `| ${plugin.name} | \`${plugin.repo_path}\` | \`${plugin.portfolio_role}\` | ${formatInstall(plugin)} | \`${plugin.release_kind}\` | \`${plugin.git_branch}\` | \`${plugin.risk_tier}\` | \`${plugin.smoke_vault}\` |`,
    );
  }

  lines.push('', '## Details', '');

  for (const plugin of manifest.plugins) {
    lines.push(`### ${plugin.name}`, '');
    lines.push(`- Path: \`${plugin.repo_path}\``);
    lines.push(`- Repo kind: \`${plugin.repo_kind}\``);
    lines.push(`- Plugin id: \`${plugin.plugin_id}\``);
    lines.push(`- Release kind: \`${plugin.release_kind}\``);
    lines.push(`- Install: ${formatInstall(plugin)}`);
    lines.push(`- CI workflow: \`${plugin.ci_workflow}\``);
    lines.push(`- Release workflow: \`${plugin.release_workflow}\``);
    lines.push(`- Artifact files: ${formatList(plugin.artifact_files)}`);
    lines.push(`- Smoke commands: ${formatList(plugin.smoke_commands)}`);
    lines.push(`- Notes: ${formatList(plugin.notes)}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

const manifest = readJson(manifestPath);
fs.writeFileSync(outputPath, buildCatalog(manifest));
