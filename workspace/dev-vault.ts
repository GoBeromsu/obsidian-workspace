import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { plugins, repoDir, root } from "./plugins";

const plugDir = `${root}/.dev-vault/.obsidian/plugins`;
mkdirSync(plugDir, { recursive: true });

const configFile = `${root}/.dev-vault/.obsidian/app.json`;
if (!existsSync(configFile)) await Bun.write(configFile, "{}\n");

const linked: string[] = [];
for (const p of plugins) {
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

await Bun.write(`${root}/.dev-vault/.obsidian/community-plugins.json`, JSON.stringify(linked, null, 2) + "\n");
