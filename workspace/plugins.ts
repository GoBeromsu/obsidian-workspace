import { resolve } from "node:path";

export type Plugin = { name: string; repo_path: string; repo_slug: string; id: string };

export const root = resolve(import.meta.dir, "..");
export const plugins: Plugin[] = await Bun.file(`${root}/workspace/plugins.json`).json();
export const repoDir = (p: Plugin) => `${root}/${p.repo_path}`;
