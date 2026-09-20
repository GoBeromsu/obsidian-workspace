import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "./dev-config.mjs";
import { initializeVault } from "./dev-vault.mjs";

export function runtimeFixture(t, { configDir = "live-config" } = {}) {
	const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "workbench-runtime-")));
	t.after(() => fs.rmSync(base, { recursive: true, force: true }));
	const root = path.join(base, "workspace");
	fs.mkdirSync(root);
	const config = loadConfig(root, { OBSIDIAN_VAULT_PATH: ".dev-vault" });
	initializeVault(config);
	fs.mkdirSync(path.join(config.vaultPath, configDir), { recursive: true });
	const repoPath = path.join(root, "sample-plugin");
	fs.mkdirSync(repoPath);
	const selection = { repoPath, pluginId: "sample-plugin", artifactFiles: ["main.js", "manifest.json", "styles.css"] };
	fs.writeFileSync(path.join(repoPath, "main.js"), "new main");
	fs.writeFileSync(path.join(repoPath, "manifest.json"), '{"id":"sample-plugin","version":"2.0.0"}');
	fs.writeFileSync(path.join(repoPath, "styles.css"), "new styles");
	const pluginDir = path.join(config.vaultPath, configDir, "plugins", selection.pluginId);
	fs.mkdirSync(pluginDir, { recursive: true });
	fs.writeFileSync(path.join(pluginDir, "manifest.json"), '{"id":"sample-plugin","version":"2.0.0"}');
	return { base, root, config, selection, configDir, pluginDir };
}

export function fakeObsidian(t, fixture, state = {}) {
	const bin = path.join(fixture.base, "bin");
	const statePath = path.join(fixture.base, "obsidian-state.json");
	fs.mkdirSync(bin);
	fs.writeFileSync(statePath, JSON.stringify({ configDir: fixture.configDir, commands: ["sample-plugin:run"], ...state }));
	const executable = path.join(bin, "obsidian");
	fs.writeFileSync(executable, `#!/usr/bin/env node
const fs=require("node:fs");
const path=require("node:path");
const statePath=process.env.OW_FAKE_OBSIDIAN_STATE;
const state=JSON.parse(fs.readFileSync(statePath,"utf8"));
const argument=process.argv.find((arg)=>arg.startsWith("code="))||"";
const code=argument.slice(5);
if(state.mode==="missing") process.exit(0);
if(state.mode==="malformed"){ console.log("__OW_DEV_JSON__{__OW_DEV_END__"); process.exit(0); }
if(state.mode==="failed"){ console.log("__OW_DEV_JSON__"+JSON.stringify({ok:false,error:"fake CLI failure"})+"__OW_DEV_END__"); process.exit(1); }
if(state.mode==="nonzero-success"){ console.log("__OW_DEV_JSON__"+JSON.stringify({ok:true,vaultPath:state.vaultPath||process.env.OW_FAKE_VAULT,configDir:state.configDir,pluginId:state.pluginId||"sample-plugin",version:"2.0.0",commands:[]})+"__OW_DEV_END__"); process.exit(1); }
if(state.vaultArg!==undefined&&!process.argv.includes("vault="+state.vaultArg)){ console.log("wrong vault argument"); process.exit(0); }
const id=state.pluginId||"sample-plugin";
const initialManifest=state.loadedManifest||{id,version:state.staleVersion||state.version||"2.0.0"};
const plugins={ [id]: { manifest: initialManifest } };
const enabledPlugins=new Set(state.enabledPlugins||[id,"unrelated-plugin"]);
const readDiskManifest=()=>JSON.parse(fs.readFileSync(path.join(process.env.OW_FAKE_VAULT,state.configDir,"plugins",id,"manifest.json"),"utf8"));
let manifests={ [id]: initialManifest };
global.app={
  vault:{configDir:state.drift&&code.includes("setConfig")?state.drift:state.configDir,adapter:{getBasePath:()=>state.vaultPath||process.env.OW_FAKE_VAULT},setConfig:()=>{state.mutations=(state.mutations||0)+1;fs.writeFileSync(statePath,JSON.stringify(state));}},
  plugins:{plugins,enabledPlugins,setEnable:async()=>{},disablePluginAndSave:async(other)=>enabledPlugins.delete(other),unloadPlugin:async(plugin)=>delete plugins[plugin],loadManifests:async()=>{manifests={ [id]: readDiskManifest() };state.loadedManifest=manifests[id];fs.writeFileSync(statePath,JSON.stringify(state));},enablePluginAndSave:async(plugin)=>{enabledPlugins.add(plugin);plugins[plugin]={manifest:manifests[plugin]};},loadPlugin:async(plugin)=>{plugins[plugin]={manifest:manifests[plugin]};}},
  commands:{commands:Object.fromEntries((state.commands||[id+":run"]).map((command)=>[command,{id:command}]))}
};
const run=async()=>{ try { await eval(code); } catch (error) { process.exitCode=1; } finally { state.enabledPlugins=[...enabledPlugins]; fs.writeFileSync(statePath,JSON.stringify(state)); } };
if(state.mode==="delayed-success") setTimeout(run,100); else run();
`);
	fs.chmodSync(executable, 0o755);
	const previousPath = process.env.PATH;
	const previousState = process.env.OW_FAKE_OBSIDIAN_STATE;
	const previousVault = process.env.OW_FAKE_VAULT;
	process.env.PATH = `${bin}${path.delimiter}${previousPath}`;
	process.env.OW_FAKE_OBSIDIAN_STATE = statePath;
	process.env.OW_FAKE_VAULT = fixture.config.vaultPath;
	t.after(() => {
		process.env.PATH = previousPath;
		if (previousState === undefined) delete process.env.OW_FAKE_OBSIDIAN_STATE; else process.env.OW_FAKE_OBSIDIAN_STATE = previousState;
		if (previousVault === undefined) delete process.env.OW_FAKE_VAULT; else process.env.OW_FAKE_VAULT = previousVault;
	});
	return { statePath, readState: () => JSON.parse(fs.readFileSync(statePath, "utf8")), writeState: (next) => fs.writeFileSync(statePath, JSON.stringify(next)) };
}
