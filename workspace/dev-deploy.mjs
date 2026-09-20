import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
	assertNoSymlinkComponents,
	assertOwnedVault,
	assertPluginId,
	safeChild,
	validateConfigDir,
} from "./dev-vault.mjs";

const REQUIRED = ["main.js", "manifest.json"];
const ALLOWED = new Set([...REQUIRED, "styles.css"]);

function fail(message) {
	throw new Error(message);
}

function lstatOrNull(target) {
	try {
		return fs.lstatSync(target);
	} catch (error) {
		if (error && error.code === "ENOENT") return null;
		throw error;
	}
}

function assertRegularFile(target, label) {
	const stat = fs.lstatSync(target);
	if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label} is not a regular file: ${target}`);
	return stat;
}

function assertSafeDestFile(target) {
	const stat = lstatOrNull(target);
	if (!stat) return;
	if (stat.isSymbolicLink()) fail(`destination symlink rejected: ${target}`);
	if (!stat.isFile() || stat.nlink > 1) fail(`destination hardlink rejected: ${target}`);
}

function assertRealDir(target, mustExist) {
	const stat = lstatOrNull(target);
	if (!stat) {
		if (mustExist) fail(`path does not exist: ${target}`);
		return;
	}
	if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`unsafe directory: ${target}`);
}

function resolveRepo(config, repoPath) {
	if (typeof repoPath !== "string" || !path.isAbsolute(repoPath)) fail("repoPath must be absolute");
	if (repoPath.includes("\0") || repoPath.split(/[/\\]/).some((segment) => segment === "." || segment === "..")) {
		fail("unsafe repoPath");
	}
	const resolvedRepo = path.resolve(repoPath);
	if (resolvedRepo !== repoPath) fail("unsafe repoPath");
	const root = path.resolve(config.root);
	const rel = path.relative(root, resolvedRepo);
	if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
		fail("repoPath must be inside workspace root");
	}
	assertNoSymlinkComponents(resolvedRepo, true);
	assertRealDir(resolvedRepo, true);
	return resolvedRepo;
}

function resolveArtifacts(repoPath, artifactFiles) {
	if (!Array.isArray(artifactFiles)) fail("artifactFiles must be an array");
	const chosen = new Map();
	const seen = new Set();
	for (const relative of artifactFiles) {
		if (typeof relative !== "string") fail("artifact path must be a string");
		const base = path.basename(relative);
		if (!ALLOWED.has(base)) fail(`refusing to deploy ${base}`);
		if (seen.has(base)) fail(`duplicate artifact ${base}`);
		seen.add(base);
		const abs = safeChild(repoPath, relative);
		try {
			assertNoSymlinkComponents(abs, true);
			assertRegularFile(abs, base);
			chosen.set(base, fs.readFileSync(abs));
		} catch (error) {
			if (base === "styles.css" && error.code === "ENOENT") continue;
			throw error;
		}
	}
	for (const name of REQUIRED) {
		if (!chosen.has(name)) fail(`missing required artifact ${name}`);
	}
	return chosen;
}

function readManifestId(bytes) {
	let parsed;
	try {
		parsed = JSON.parse(bytes.toString("utf8"));
	} catch {
		fail("manifest.json is not valid JSON");
	}
	return assertPluginId(parsed?.id);
}

export function deployArtifacts(config, selection, configDir) {
	if (!selection || typeof selection !== "object") fail("selection is required");
	assertOwnedVault(config);
	const pluginId = assertPluginId(selection.pluginId);
	const repoPath = resolveRepo(config, selection.repoPath);
	const chosen = resolveArtifacts(repoPath, selection.artifactFiles);
	const manifestId = readManifestId(chosen.get("manifest.json"));
	if (manifestId !== pluginId) fail(`manifest id ${manifestId} does not match pluginId ${pluginId}`);

	const absConfigDir = validateConfigDir(config, configDir);
	assertRealDir(absConfigDir, true);
	const pluginsDir = safeChild(absConfigDir, "plugins");
	const pluginDir = safeChild(absConfigDir, `plugins/${pluginId}`);
	assertNoSymlinkComponents(absConfigDir, true);
	assertRealDir(pluginsDir, false);
	assertRealDir(pluginDir, false);

	const planned = [];
	for (const name of ["main.js", "manifest.json", "styles.css"]) {
		if (!chosen.has(name)) continue;
		const dest = safeChild(pluginDir, name);
		assertSafeDestFile(dest);
		planned.push({ dest, bytes: chosen.get(name), staging: null });
	}
	const destStyles = safeChild(pluginDir, "styles.css");
	const removeStyles = !chosen.has("styles.css") && Boolean(lstatOrNull(destStyles));
	if (removeStyles) assertSafeDestFile(destStyles);

	validateConfigDir(config, configDir);
	for (const directory of [pluginsDir, pluginDir]) {
		assertOwnedVault(config);
		assertNoSymlinkComponents(directory, false);
		assertRealDir(directory, false);
		if (!lstatOrNull(directory)) fs.mkdirSync(directory);
	}
	const revalidate = () => {
		assertOwnedVault(config);
		assertNoSymlinkComponents(pluginDir, true);
		assertRealDir(pluginDir, true);
	};
	try {
		for (const item of planned) {
			revalidate();
			const staging = safeChild(pluginDir, `.workbench-staging-${randomUUID()}`);
			const fd = fs.openSync(staging, "wx", 0o600);
			item.staging = staging;
			try {
				fs.writeFileSync(fd, item.bytes);
			} finally {
				fs.closeSync(fd);
			}
		}
		for (const item of planned) {
			revalidate();
			assertSafeDestFile(item.dest);
			fs.renameSync(item.staging, item.dest);
			item.staging = null;
		}
		if (removeStyles) {
			revalidate();
			assertSafeDestFile(destStyles);
			fs.unlinkSync(destStyles);
		}
	} finally {
		for (const item of planned) {
			if (item.staging) {
				revalidate();
				fs.unlinkSync(item.staging);
			}
		}
	}
	return { pluginDir, files: planned.map(({ dest }) => dest) };
}
