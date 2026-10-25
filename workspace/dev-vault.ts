import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { plugins, repoDir, root } from "./plugins";

const plugDir = `${root}/.dev-vault/.obsidian/plugins`;
mkdirSync(plugDir, { recursive: true });

const configFile = `${root}/.dev-vault/.obsidian/app.json`;
if (!existsSync(configFile)) await Bun.write(configFile, "{}\n");

for (const p of plugins) {
  const link = `${plugDir}/${p.id}`;
  if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false })) rmSync(link, { recursive: true });
  symlinkSync(`${repoDir(p)}/dist`, link);
  console.log(`${p.id} -> ${p.repo_path}/dist`);
}

await Bun.write(`${root}/.dev-vault/.obsidian/community-plugins.json`, JSON.stringify(plugins.map((p) => p.id), null, 2) + "\n");
