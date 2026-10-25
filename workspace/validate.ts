import { plugins } from "./plugins";

const keys = ["name", "repo_path", "repo_slug", "id"] as const;
const errors: string[] = [];
for (const field of keys) {
  const seen = new Set<string>();
  for (const p of plugins) {
    const v = p[field];
    if (typeof v !== "string" || !v) errors.push(`${p.name ?? "?"}: missing ${field}`);
    else if (field !== "name" && seen.has(v)) errors.push(`duplicate ${field}: ${v}`);
    seen.add(v);
  }
}
for (const p of plugins) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(p.repo_slug ?? "")) errors.push(`${p.name}: bad repo_slug`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`${plugins.length} plugins ok`);
