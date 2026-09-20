#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCycle } from './dev-cycle.mjs';
import { loadConfig } from './dev-config.mjs';
import { selectPlugin } from './dev-selection.mjs';
import { assertOwnedVault, initializeVault } from './dev-vault.mjs';
import { watchPlugin } from './dev-watch.mjs';
import { discoverRuntime, verifyPlugin } from './dev-runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(root, 'workspace', 'plugins.manifest.json');
const VERBS = new Set(['init', 'list', 'build', 'watch', 'verify']);

function emit(payload) {
  const line = JSON.stringify(payload);
  if (payload.ok === false) console.error(line);
  else console.log(line);
}

function requireSelector(selector) {
  if (!selector) {
    throw new Error('plugin selector required (plugin_id or repo_path); Eagle is not the implicit default');
  }
  return selector;
}

function supportStatus(plugin) {
  if (plugin.plugin_id === 'eagle' || plugin.repo_path === 'obsidian-eagle-plugin') return 'supported';
  return 'unsupported: live workbench is Eagle-only';
}

function listInventory() {
  let configNote = 'bare';
  try {
    const config = loadConfig(root, process.env);
    configNote = `vaultPath=${config.vaultPath}`;
  } catch (error) {
    configNote = `bare: ${error.message}`;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const plugins = (manifest.plugins || []).map((plugin) => ({
    name: plugin.name,
    pluginId: plugin.plugin_id,
    repoPath: plugin.repo_path,
    support: supportStatus(plugin),
  }));
  emit({ ok: true, verb: 'list', config: configNote, plugins });
}

function bindSignals(controller) {
  const stop = () => controller.abort();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return () => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  };
}

async function withSignals(run) {
  const controller = new AbortController();
  const unbind = bindSignals(controller);
  try {
    return await run(controller.signal);
  } finally {
    unbind();
  }
}

async function runWatch(config, selection, signal) {
  const handle = watchPlugin(
    selection,
    async () => {
      const result = await runCycle(config, selection, { signal });
      emit({
        ok: true,
        verb: 'watch',
        pluginId: selection.pluginId,
        runtime: result.runtime,
        deployed: result.deployed,
        reloaded: result.reloaded,
        verified: result.verified,
      });
    },
    {
      signal,
      onError(error) {
        emit({ ok: false, verb: 'watch', error: error.message });
      },
    },
  );
  handle.request();
  const result = await handle.done;
  if (result.error) {
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function main() {
  const [verb, selector] = process.argv.slice(2);
  if (!VERBS.has(verb)) {
    emit({ ok: false, error: 'usage: node workspace/dev.mjs init|list|build|watch|verify [plugin]' });
    process.exitCode = 2;
    return;
  }
  if (verb === 'list') {
    listInventory();
    return;
  }
  const config = loadConfig(root, process.env);
  if (verb === 'init') {
    initializeVault(config);
    emit({ ok: true, verb: 'init', vaultPath: config.vaultPath });
    return;
  }
  const selection = selectPlugin(root, requireSelector(selector));
  await withSignals(async (signal) => {
    if (verb === 'build') {
      const result = await runCycle(config, selection, { signal });
      emit({
        ok: true,
        verb: 'build',
        pluginId: selection.pluginId,
        vaultPath: result.runtime.vaultPath,
        configDir: result.runtime.configDir,
        deployed: result.deployed,
        reloaded: result.reloaded,
        verified: result.verified,
      });
      return;
    }
    assertOwnedVault(config);
    if (verb === 'verify') {
      const runtime = await discoverRuntime(config, { signal });
      const verified = await verifyPlugin(config, selection, runtime, { signal });
      emit({ ok: true, verb: 'verify', pluginId: selection.pluginId, verified });
      return;
    }
    if (await runWatch(config, selection, signal)) {
      emit({ ok: true, verb: 'watch', pluginId: selection.pluginId, stopped: true });
    }
  });
}

main().catch((error) => {
  emit({ ok: false, error: error.message });
  process.exitCode = 1;
});
