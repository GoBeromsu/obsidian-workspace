import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

/** Obsidian supplies these at runtime; bundling them would break the plugin. */
const external = [
  "obsidian",
  "electron",
  "node:child_process",
  "node:os",
  "node:path",
  "node:fs",
  "node:fs/promises",
];

const options = {
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "es2022",
  logLevel: "info",
  sourcemap: watch ? "inline" : false,
  treeShaking: true,
  external,
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
