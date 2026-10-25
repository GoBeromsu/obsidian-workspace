import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { plugins, repoDir, root } from "./plugins";

const id = process.argv[2];
const targets = id ? plugins.filter((p) => p.id === id) : plugins;
if (id && !targets.length) {
  console.error(`unknown id "${id}"; valid: ${plugins.map((p) => p.id).join(", ")}`);
  process.exit(1);
}

const vault = `${root}/${id ? `.dev-vault-${id}` : ".dev-vault"}`;
const plugDir = `${vault}/.obsidian/plugins`;
mkdirSync(plugDir, { recursive: true });

const configFile = `${vault}/.obsidian/app.json`;
const config = existsSync(configFile) ? await Bun.file(configFile).json() : {};
// Obsidian 1.15 opens Settings in a popout window, which CLI screenshots cannot see.
config.settingsPopoutWindow = false;
await Bun.write(configFile, JSON.stringify(config, null, 2) + "\n");

const linked: string[] = [];
for (const p of targets) {
  const dist = `${repoDir(p)}/dist`;
  if (existsSync(`${dist}/manifest.json`)) {
    rmSync(`${plugDir}/${p.id}`, { recursive: true, force: true });
    symlinkSync(dist, `${plugDir}/${p.id}`);
    linked.push(p.id);
    console.log(`${p.id} -> ${p.repo_path}/dist`);
  } else {
    console.warn(`skip ${p.id}: run \`bun run build\` in ${p.repo_path}`);
  }
}

for (const name of readdirSync(plugDir)) {
  if (!linked.includes(name)) rmSync(`${plugDir}/${name}`, { recursive: true, force: true });
}

await Bun.write(`${vault}/.obsidian/community-plugins.json`, JSON.stringify(linked, null, 2) + "\n");
