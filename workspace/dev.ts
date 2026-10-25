import { plugins, repoDir } from "./plugins";

const obsidian = "/Applications/Obsidian.app/Contents/MacOS/obsidian";
const p = plugins.find((x) => x.id === Bun.argv[2] || x.repo_path === Bun.argv[2]);
if (!p) {
  console.error(`usage: bun workspace/dev.ts <${plugins.map((x) => x.id).join("|")}>`);
  process.exit(1);
}

const reload = () => Bun.spawn([obsidian, "vault=.dev-vault", "plugin:reload", `id=${p.id}`], { stdio: ["ignore", "inherit", "inherit"] });
const watcher = Bun.spawn(["bun", "run", "dev"], { cwd: repoDir(p), stdio: ["inherit", "inherit", "inherit"] });

const { watch } = await import("node:fs");
let timer: Timer | undefined;
watch(`${repoDir(p)}/dist`, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(reload, 300);
});
await watcher.exited;
