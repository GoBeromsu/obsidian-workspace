import { existsSync } from "node:fs";
import { plugins, repoDir, root } from "./plugins";

for (const p of plugins) {
  if (existsSync(`${repoDir(p)}/.git`)) continue;
  console.log(`clone ${p.repo_slug} -> ${p.repo_path}`);
  const r = Bun.spawnSync(["gh", "repo", "clone", p.repo_slug, p.repo_path], { cwd: root, stdio: ["inherit", "inherit", "inherit"] });
  if (r.exitCode) process.exitCode = 1;
}
