import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "./dev-config.mjs";
import { deployArtifacts } from "./dev-deploy.mjs";
import { assertNoSymlinkComponents, assertOwnedVault, assertPluginId, initializeVault, safeChild, validateConfigDir } from "./dev-vault.mjs";

function fixture(t) {
	const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "workbench-safety-")));
	t.after(() => fs.rmSync(base, { recursive: true, force: true }));
	const root = path.join(base, "workspace");
	fs.mkdirSync(root);
	const config = loadConfig(root, { OBSIDIAN_VAULT_PATH: ".dev-vault" });
	return { base, root, config, vault: config.vaultPath, marker: path.join(config.vaultPath, ".workbench-vault.json") };
}

function build(t) {
	const f = fixture(t);
	initializeVault(f.config);
	const repoPath = path.join(f.root, "sample-plugin");
	fs.mkdirSync(repoPath);
	const selection = { repoPath, pluginId: "sample-plugin", artifactFiles: ["main.js", "manifest.json", "styles.css"] };
	const pluginDir = path.join(f.vault, "live-config/plugins/sample-plugin");
	fs.mkdirSync(pluginDir, { recursive: true });
	const source = (name) => path.join(repoPath, name);
	const dest = (name) => path.join(pluginDir, name);
	fs.writeFileSync(source("main.js"), "new main");
	fs.writeFileSync(source("manifest.json"), '{"id":"sample-plugin","version":"2"}');
	for (const name of ["main.js", "manifest.json", "styles.css", "data.json"]) fs.writeFileSync(dest(name), `old ${name}`);
	return { ...f, selection, pluginDir, source, dest, deploy: () => deployArtifacts(f.config, selection, "live-config") };
}

test("relative dotenv, exact absolute paths, precedence and sanitized forwarding", (t) => {
	const { root, vault } = fixture(t);
	fs.writeFileSync(path.join(root, ".env"), "OBSIDIAN_VAULT_PATH=.dev-vault\nCHOICE=file\nNODE_OPTIONS=unsafe\nNODE_PATH=unsafe\n");
	assert.equal(loadConfig(root, {}).vaultPath, vault);
	const config = loadConfig(root, { OBSIDIAN_VAULT_PATH: vault, VAULT_PATH: ".dev-vault", VAULT_PATHS: vault, CHOICE: "process" });
	assert.equal(config.env.CHOICE, "process");
	for (const key of ["OBSIDIAN_VAULT_PATH", "VAULT_PATH", "VAULT_PATHS"]) assert.equal(config.env[key], vault);
	assert.equal(config.env.VAULT_NAME, ".dev-vault");
	assert.equal("NODE_OPTIONS" in config.env, false);
	assert.equal("NODE_PATH" in config.env, false);
	fs.writeFileSync(path.join(root, ".env"), "OBSIDIAN_VAULT_PATH=/production\n");
	assert.equal(loadConfig(root, { OBSIDIAN_VAULT_PATH: ".dev-vault" }).vaultPath, vault);
});

test("missing, production, traversal and conflicting config fail closed", (t) => {
	const { root, vault } = fixture(t);
	assert.throws(() => loadConfig(root, {}), /missing/);
	for (const value of ["", "/production", "../.dev-vault", "./.dev-vault", ".dev-vault/", `${vault}/../.dev-vault`]) {
		assert.throws(() => loadConfig(root, { OBSIDIAN_VAULT_PATH: value }));
	}
	for (const key of ["VAULT_PATH", "VAULT_PATHS", "VAULT_NAME"]) {
		assert.throws(() => loadConfig(root, { OBSIDIAN_VAULT_PATH: vault, [key]: "/production" }));
	}
});

test("parent aliases canonicalize but root, dotenv and vault symlinks fail", (t) => {
	const { base, root, vault } = fixture(t);
	const alias = path.join(base, "parent-alias");
	fs.symlinkSync(base, alias);
	assert.equal(loadConfig(path.join(alias, "workspace"), { OBSIDIAN_VAULT_PATH: vault }).root, root);
	assert.throws(() => loadConfig(path.join(alias, "workspace"), { OBSIDIAN_VAULT_PATH: path.join(alias, "workspace/.dev-vault") }));
	const linkedRoot = path.join(base, "linked-root");
	fs.symlinkSync(root, linkedRoot);
	assert.throws(() => loadConfig(linkedRoot, { OBSIDIAN_VAULT_PATH: vault }), /symlink/);
	fs.symlinkSync(path.join(base, "missing"), path.join(root, ".env"));
	assert.throws(() => loadConfig(root, { OBSIDIAN_VAULT_PATH: vault }), /unsafe .env/);
	fs.unlinkSync(path.join(root, ".env"));
	fs.symlinkSync(base, vault);
	assert.throws(() => loadConfig(root, { OBSIDIAN_VAULT_PATH: vault }), /symlink/);
});

test("initialization owns only new or empty paths and preserves valid markers", (t) => {
	const f = fixture(t);
	fs.mkdirSync(f.vault);
	assert.equal(initializeVault(f.config), f.vault);
	const bytes = fs.readFileSync(f.marker);
	initializeVault(f.config);
	assert.deepEqual(fs.readFileSync(f.marker), bytes);
	assert.equal(assertOwnedVault(f.config), f.vault);
	const other = fixture(t);
	fs.mkdirSync(other.vault);
	fs.writeFileSync(path.join(other.vault, "notes.md"), "private");
	assert.throws(() => initializeVault(other.config), /nonempty unowned/);
	assert.equal(fs.readFileSync(path.join(other.vault, "notes.md"), "utf8"), "private");
	assert.equal(fs.existsSync(other.marker), false);
});

test("existing invalid, hardlinked and symlinked markers are never overwritten", (t) => {
	const f = fixture(t);
	initializeVault(f.config);
	const link = path.join(f.base, "marker-copy");
	fs.linkSync(f.marker, link);
	assert.throws(() => assertOwnedVault(f.config), /invalid vault marker/);
	assert.throws(() => initializeVault(f.config), /invalid vault marker/);
	fs.unlinkSync(link);
	for (const bytes of ["{", "null", '{"version":1,"root":"/wrong"}']) {
		fs.writeFileSync(f.marker, bytes);
		assert.throws(() => initializeVault(f.config));
		assert.equal(fs.readFileSync(f.marker, "utf8"), bytes);
	}
	fs.renameSync(f.marker, link);
	fs.symlinkSync(link, f.marker);
	assert.throws(() => initializeVault(f.config), /invalid vault marker/);
	assert.equal(fs.readFileSync(link, "utf8"), '{"version":1,"root":"/wrong"}');
});

test("marker creation is exclusive even after the emptiness check", (t) => {
	const f = fixture(t);
	fs.mkdirSync(f.vault);
	const readDirectory = fs.readdirSync;
	t.mock.method(fs, "readdirSync", (target, ...args) => {
		const entries = readDirectory(target, ...args);
		if (target === f.vault) fs.writeFileSync(f.marker, "existing marker");
		return entries;
	});
	assert.throws(() => initializeVault(f.config), { code: "EEXIST" });
	assert.equal(fs.readFileSync(f.marker, "utf8"), "existing marker");
});

test("relative live config directories reject traversal, absolute paths and links", (t) => {
	const f = fixture(t);
	initializeVault(f.config);
	for (const relative of ["", "..", "../outside", "/absolute", "a/../b", "a\\b", "a//b", "a\0b"]) {
		assert.throws(() => safeChild(f.vault, relative));
		assert.throws(() => validateConfigDir(f.config, relative));
	}
	for (const id of ["../plugin", "Upper", "a/b", "a--b", ""]) assert.throws(() => assertPluginId(id));
	fs.symlinkSync(f.base, path.join(f.vault, "linked-config"));
	assert.throws(() => validateConfigDir(f.config, "linked-config"), /symlink/);
	assert.throws(() => assertNoSymlinkComponents(path.join(f.vault, "linked-config/missing"), false), /symlink/);
	fs.mkdirSync(path.join(f.vault, "live"));
	assert.equal(validateConfigDir(f.config, "live"), path.join(f.vault, "live"));
});

test("deployment copies only artifacts and preserves settings and predictable staging paths", (t) => {
	const f = build(t);
	fs.writeFileSync(f.source("styles.css"), "new styles");
	fs.writeFileSync(f.dest("main.js.workbench-staging"), "unrelated");
	fs.writeFileSync(f.dest(".workbench-staging"), "also unrelated");
	const result = f.deploy();
	assert.equal(result.pluginDir, f.pluginDir);
	assert.deepEqual(result.files.map((file) => path.basename(file)), ["main.js", "manifest.json", "styles.css"]);
	for (const name of f.selection.artifactFiles) assert.deepEqual(fs.readFileSync(f.dest(name)), fs.readFileSync(f.source(name)));
	assert.equal(fs.readFileSync(f.dest("data.json"), "utf8"), "old data.json");
	assert.equal(fs.readFileSync(f.dest("main.js.workbench-staging"), "utf8"), "unrelated");
	assert.equal(fs.readFileSync(f.dest(".workbench-staging"), "utf8"), "also unrelated");
	assert.equal(fs.readdirSync(f.pluginDir).some((name) => name.startsWith(".workbench-staging-")), false);
});

test("absent optional styles are skipped whether listed or omitted", async (t) => {
	for (const styles of [[], ["styles.css"], ["missing/styles.css"]]) await t.test(JSON.stringify(styles), (t) => {
		const f = build(t);
		f.selection.artifactFiles = ["main.js", "manifest.json", ...styles];
		assert.equal(f.deploy().files.length, 2);
		assert.equal(fs.existsSync(f.dest("styles.css")), false);
		assert.equal(fs.readFileSync(f.dest("data.json"), "utf8"), "old data.json");
	});
});

test("source validation failures leave all deployed bytes unchanged", async (t) => {
	const cases = {
		missingMain: (f) => fs.unlinkSync(f.source("main.js")),
		invalidManifest: (f) => fs.writeFileSync(f.source("manifest.json"), "{"),
		manifestMismatch: (f) => fs.writeFileSync(f.source("manifest.json"), '{"id":"other-plugin"}'),
		invalidStyles: (f) => fs.mkdirSync(f.source("styles.css")),
		symlinkStyles: (f) => fs.symlinkSync(f.source("missing"), f.source("styles.css")),
		symlinkSource: (f) => { fs.unlinkSync(f.source("main.js")); fs.symlinkSync(f.dest("main.js"), f.source("main.js")); },
		symlinkParent: (f) => { fs.symlinkSync(f.selection.repoPath, f.source("linked")); f.selection.artifactFiles[0] = "linked/main.js"; },
		traversal: (f) => { f.selection.artifactFiles[0] = "../main.js"; },
		absolute: (f) => { f.selection.artifactFiles[0] = f.source("main.js"); },
		duplicate: (f) => f.selection.artifactFiles.push("other/styles.css"),
		unlistedFile: (f) => f.selection.artifactFiles.push("data.json"),
	};
	for (const [name, damage] of Object.entries(cases)) await t.test(name, (t) => {
		const f = build(t);
		damage(f);
		assert.throws(f.deploy);
		for (const name of ["main.js", "manifest.json", "styles.css", "data.json"]) assert.equal(fs.readFileSync(f.dest(name), "utf8"), `old ${name}`);
		assert.deepEqual(fs.readdirSync(f.pluginDir).sort(), ["data.json", "main.js", "manifest.json", "styles.css"]);
	});
});

test("destination symlinks and hardlinks block replacement and obsolete CSS removal", async (t) => {
	for (const name of ["main.js", "styles.css"]) for (const kind of ["linkSync", "symlinkSync"]) await t.test(`${name} ${kind}`, (t) => {
		const f = build(t);
		const outside = path.join(f.base, "outside");
		fs.writeFileSync(outside, "untouched");
		fs.unlinkSync(f.dest(name));
		fs[kind](outside, f.dest(name));
		assert.throws(f.deploy, /destination/);
		assert.equal(fs.readFileSync(outside, "utf8"), "untouched");
		assert.equal(fs.readFileSync(f.dest("manifest.json"), "utf8"), "old manifest.json");
		assert.equal(fs.readFileSync(f.dest("data.json"), "utf8"), "old data.json");
	});
});
