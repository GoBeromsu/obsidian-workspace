import { closeSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runBuild as defaultRunBuild } from './dev-build.mjs';
import { deployArtifacts as defaultDeployArtifacts } from './dev-deploy.mjs';
import { discoverRuntime as defaultDiscoverRuntime, reloadPlugin as defaultReloadPlugin, verifyPlugin as defaultVerifyPlugin } from './dev-runtime.mjs';
import { assertOwnedVault, assertPluginId } from './dev-vault.mjs';

const LOCK_NAME = '.dev-cycle.lock';

function acquireLock(vaultPath) {
  const lockPath = join(vaultPath, LOCK_NAME);
  let fd;
  try {
    fd = openSync(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`exclusive cycle lock exists: ${lockPath}. Another CLI holds the full build/deploy/reload lock. No stale-lock recovery.`);
    }
    throw error;
  }
  try {
    writeFileSync(fd, `${process.pid}\n`);
  } catch (error) {
    try { closeSync(fd); } catch {}
    try { unlinkSync(lockPath); } catch {}
    throw error;
  }
  return { fd, lockPath };
}

function releaseLock(lock) {
  if (!lock) return;
  try { closeSync(lock.fd); } catch {}
  try { unlinkSync(lock.lockPath); } catch {}
}

export async function runCycle(config, selection, options = {}) {
  const {
    signal,
    runBuild = defaultRunBuild,
    discoverRuntime = defaultDiscoverRuntime,
    deployArtifacts = defaultDeployArtifacts,
    reloadPlugin = defaultReloadPlugin,
    verifyPlugin = defaultVerifyPlugin,
  } = options;
  assertOwnedVault(config);
  assertPluginId(selection.pluginId);
  const runtime = await discoverRuntime(config, { signal });
  let lock;
  try {
    lock = acquireLock(config.vaultPath);
    if (signal?.aborted) throw new Error('aborted');
    await runBuild(selection, config.env, { signal });
    if (signal?.aborted) throw new Error('aborted');
    const deployed = await deployArtifacts(config, selection, runtime.configDir);
    const reloaded = await reloadPlugin(config, selection, runtime);
    const verified = await verifyPlugin(config, selection, runtime);
    return { runtime, deployed, reloaded, verified };
  } finally {
    releaseLock(lock);
  }
}
