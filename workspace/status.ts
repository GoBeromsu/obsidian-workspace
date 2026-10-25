import { plugins } from "./plugins";

const gh = async (...args: string[]) => {
  const r = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "ignore" });
  const out = (await new Response(r.stdout).text()).trim();
  return (await r.exited) ? "" : out;
};

const rows = await Promise.all(
  plugins.map(async ({ id, repo_slug: s }) => {
    const [ci, tag, prs] = await Promise.all([
      gh("run", "list", "-R", s, "-L", "1", "--json", "status,conclusion", "-q", '.[0] | .conclusion // .status // empty'),
      gh("release", "list", "-R", s, "-L", "1", "--json", "tagName", "-q", ".[0].tagName"),
      gh("pr", "list", "-R", s, "--json", "number", "-q", "length"),
    ]);
    return { plugin: id, ci: ci || "-", release: tag || "-", open_prs: prs || "?" };
  }),
);
console.table(rows);
