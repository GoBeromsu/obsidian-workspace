import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { assertOwnedVault, assertPluginId, validateConfigDir } from './dev-vault.mjs';

const SENTINEL = '__OW_DEV_JSON__';
const SENTINEL_END = '__OW_DEV_END__';
const TIMEOUT_MS = 30_000;

function vaultArg(config) {
  return `vault=${basename(config.vaultPath)}`;
}

function connectionBlocker(config, text) {
  const name = basename(config.vaultPath);
  const clip = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return `No matching running vault/CLI connection for vault=${name} at ${config.vaultPath}. Open that dedicated vault in Obsidian (obsidian vault=${name}). Do not rewrite the Obsidian vault registry. Parent opens only this path.${clip ? ` Output: ${clip}` : ''}`;
}

function parseRuntimeOutput(stdout, stderr, config) {
  const text = `${stdout ?? ''}\n${stderr ?? ''}`;
  const start = text.indexOf(SENTINEL);
  const stop = start === -1 ? -1 : text.indexOf(SENTINEL_END, start + SENTINEL.length);
  if (start === -1 || stop === -1) throw new Error(connectionBlocker(config, text));
  let payload;
  try {
    payload = JSON.parse(text.slice(start + SENTINEL.length, stop));
  } catch {
    throw new Error('invalid JSON sentinel from Obsidian eval');
  }
  if (!payload || payload.ok === false) throw new Error(payload?.error || 'runtime eval failed');
  return payload;
}

function buildEval(vaultPath, body) {
  return `(async()=>{const expected=${JSON.stringify(vaultPath)};try{const base=app?.vault?.adapter?.getBasePath?.();if(base!==expected)throw new Error("vault path mismatch: got "+JSON.stringify(base)+" expected "+JSON.stringify(expected));${body}const payload={ok:true,...out};console.log(${JSON.stringify(SENTINEL)}+JSON.stringify(payload)+${JSON.stringify(SENTINEL_END)});return payload;}catch(error){const payload={ok:false,error:String(error&&error.message||error)};console.log(${JSON.stringify(SENTINEL)}+JSON.stringify(payload)+${JSON.stringify(SENTINEL_END)});throw error;}})()`;
}

function receiptBody(pluginId, configDir, mutate) {
  const id = JSON.stringify(pluginId);
  const expectedConfigDir = JSON.stringify(configDir);
  const prelude = mutate
    ? `if(typeof app.vault?.setConfig!=="function")throw new Error("Obsidian vault configuration API unavailable");if(typeof app.plugins?.setEnable!=="function"||typeof app.plugins.disablePluginAndSave!=="function"||typeof app.plugins.unloadPlugin!=="function"||typeof app.plugins.loadManifests!=="function"||typeof app.plugins.enablePluginAndSave!=="function")throw new Error("Obsidian plugin management API unavailable");app.vault.setConfig("enableCommunityPlugins",true);await app.plugins.setEnable(true);for(const other of [...app.plugins.enabledPlugins]){if(other!==id)await app.plugins.disablePluginAndSave(other);}if(app.plugins.plugins[id])await app.plugins.unloadPlugin(id);await app.plugins.loadManifests();await app.plugins.enablePluginAndSave(id);`
    : '';
  return `const id=${id};const expectedConfigDir=${expectedConfigDir};if(app.vault.configDir!==expectedConfigDir)throw new Error("runtime configDir mismatch: "+JSON.stringify(app.vault.configDir)+" != "+JSON.stringify(expectedConfigDir));${prelude}const inst=app.plugins.plugins[id];if(!inst)throw new Error("plugin not loaded: "+id);if(inst.manifest?.id!==id||typeof inst.manifest?.version!=="string"||inst.manifest.version.length===0)throw new Error("plugin manifest receipt mismatch: "+id);const enabled=[...app.plugins.enabledPlugins];if(enabled.length!==1||enabled[0]!==id)throw new Error("unexpected enabled community plugins: "+JSON.stringify(enabled));const commands=Object.values(app.commands?.commands||{}).filter((c)=>typeof c?.id==="string"&&c.id.startsWith(id+":")).map((c)=>c.id);const out={pluginId:id,version:inst.manifest.version,vaultPath:base,configDir:app.vault.configDir,commands,enabledPlugins:enabled};`;
}

function runObsidianEval(config, code, { signal } = {}) {
  assertOwnedVault(config);
  const args = [vaultArg(config), 'eval', `code=${code}`];
  return new Promise((resolve, reject) => {
    const child = execFile('obsidian', args, {
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      signal,
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (signal?.aborted) {
        reject(error instanceof Error ? error : new Error('aborted'));
        return;
      }
      if (error && error.code === 'ENOENT') {
        reject(new Error(`obsidian CLI not found on PATH; install it and open vault=${basename(config.vaultPath)} at ${config.vaultPath} (do not rewrite the Obsidian vault registry)`));
        return;
      }
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(parseRuntimeOutput(stdout, stderr, config));
      } catch (parseError) {
        reject(parseError);
      }
    });
    const kill = () => {
      try { child.kill('SIGTERM'); } catch {}
    };
    if (signal) {
      if (signal.aborted) kill();
      else signal.addEventListener('abort', kill, { once: true });
    }
    child.once('close', () => signal?.removeEventListener('abort', kill));
  });
}

function asRuntime(config, payload) {
  if (!payload || payload.vaultPath !== config.vaultPath) {
    throw new Error(`runtime vaultPath mismatch: ${payload?.vaultPath} != ${config.vaultPath}`);
  }
  validateConfigDir(config, payload.configDir);
  return { vaultPath: payload.vaultPath, configDir: payload.configDir, pluginId: payload.pluginId, version: payload.version ?? null, commands: payload.commands ?? [] };
}

function assertRuntimeMatch(config, runtime) {
  if (!runtime || runtime.vaultPath !== config.vaultPath) throw new Error(`runtime vaultPath mismatch: ${runtime?.vaultPath} != ${config.vaultPath}`);
  validateConfigDir(config, runtime.configDir);
}

function assertReceipt(selection, runtime) {
  if (runtime.pluginId !== selection.pluginId) throw new Error(`runtime pluginId mismatch: ${runtime.pluginId} != ${selection.pluginId}`);
  if (!Array.isArray(runtime.commands) || runtime.commands.some((id) => typeof id !== 'string' || !id.startsWith(`${selection.pluginId}:`))) {
    throw new Error(`runtime command receipt mismatch for ${selection.pluginId}`);
  }
}

export async function discoverRuntime(config, { signal } = {}) {
  const payload = await runObsidianEval(
    config,
    buildEval(config.vaultPath, 'const out={vaultPath:base,configDir:app.vault.configDir};'),
    { signal },
  );
  return asRuntime(config, payload);
}

export async function reloadPlugin(config, selection, runtime, { signal } = {}) {
  assertPluginId(selection.pluginId);
  assertRuntimeMatch(config, runtime);
  const payload = await runObsidianEval(config, buildEval(config.vaultPath, receiptBody(selection.pluginId, runtime.configDir, true)), { signal });
  const receipt = asRuntime(config, payload);
  assertReceipt(selection, receipt);
  return receipt;
}

export async function verifyPlugin(config, selection, runtime, { signal } = {}) {
  assertPluginId(selection.pluginId);
  assertRuntimeMatch(config, runtime);
  const payload = await runObsidianEval(config, buildEval(config.vaultPath, receiptBody(selection.pluginId, runtime.configDir, false)), { signal });
  const receipt = asRuntime(config, payload);
  assertReceipt(selection, receipt);
  return receipt;
}
