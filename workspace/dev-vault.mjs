import fs from "node:fs";
import path from "node:path";

const MARKER_NAME = ".workbench-vault.json";
const PLUGIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function hasUnsafeSegments(relative) {
	return relative.split(/[/\\]/).some((segment) => segment === "" || segment === "." || segment === "..");
}

export function safeChild(base, relative) {
	if (typeof base !== "string" || base.length === 0) fail("base path is required");
	if (typeof relative !== "string" || relative.length === 0) fail("relative path is required");
	if (path.isAbsolute(relative) || relative.includes("\0") || relative.includes("\\") || hasUnsafeSegments(relative)) {
		fail(`unsafe relative path: ${relative}`);
	}
	const resolvedBase = path.resolve(base);
	const resolved = path.resolve(resolvedBase, relative);
	const rel = path.relative(resolvedBase, resolved);
	if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
		fail(`path escapes base: ${relative}`);
	}
	return resolved;
}

export function assertNoSymlinkComponents(absPath, lastMustExist) {
	if (typeof absPath !== "string" || !path.isAbsolute(absPath) || absPath.includes("\0")
		|| absPath.includes("\\") || path.resolve(absPath) !== absPath) fail("unsafe absolute path");
	const resolved = path.resolve(absPath);
	const parts = resolved.split(path.sep);
	let current = path.parse(resolved).root;
	for (let i = 1; i < parts.length; i += 1) {
		current = path.join(current, parts[i]);
		const last = i === parts.length - 1;
		let stat;
		try {
			stat = fs.lstatSync(current);
		} catch (error) {
			if (error.code === "ENOENT" && last && !lastMustExist) return resolved;
			throw error;
		}
		if (stat.isSymbolicLink()) fail(`symlink rejected: ${current}`);
		if (!last && !stat.isDirectory()) fail(`not a directory: ${current}`);
	}
	return resolved;
}

function dedicatedPath(config) {
	if (!config || typeof config.root !== "string" || typeof config.vaultPath !== "string") {
		fail("invalid vault config");
	}
	const root = path.resolve(config.root);
	const dedicated = path.join(root, ".dev-vault");
	if (config.root !== root || config.vaultPath !== dedicated) fail("vaultPath is not the dedicated workbench vault");
	assertNoSymlinkComponents(root, true);
	if (!fs.lstatSync(root).isDirectory()) fail(`root is not a directory: ${root}`);
	return { root, vaultPath: dedicated };
}

function markerFile(vaultPath) {
	return path.join(vaultPath, MARKER_NAME);
}

function readMarker(vaultPath) {
	const file = markerFile(vaultPath);
	const stat = lstatOrNull(file);
	if (!stat) return null;
	if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1) fail(`invalid vault marker: ${file}`);
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		fail(`invalid vault marker: ${file}`);
	}
}

function markerMatches(marker, root, vaultPath) {
	return Boolean(marker) && marker.version === 1 && marker.root === root && marker.vaultPath === vaultPath;
}

function writeMarker(root, vaultPath) {
	assertNoSymlinkComponents(vaultPath, true);
	fs.writeFileSync(markerFile(vaultPath), `${JSON.stringify({ version: 1, root, vaultPath })}\n`, { flag: "wx" });
}

export function assertPluginId(id) {
	if (typeof id !== "string" || !PLUGIN_ID.test(id)) fail(`unsafe plugin id: ${id}`);
	return id;
}

export function assertOwnedVault(config) {
	const { root, vaultPath } = dedicatedPath(config);
	assertNoSymlinkComponents(root, true);
	assertNoSymlinkComponents(vaultPath, true);
	const stat = fs.lstatSync(vaultPath);
	if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`vault is not a directory: ${vaultPath}`);
	if (!markerMatches(readMarker(vaultPath), root, vaultPath)) fail(`unowned workbench vault: ${vaultPath}`);
	return vaultPath;
}

export function initializeVault(config) {
	const { root, vaultPath } = dedicatedPath(config);
	assertNoSymlinkComponents(root, true);
	assertNoSymlinkComponents(vaultPath, false);
	const stat = lstatOrNull(vaultPath);
	if (!stat) {
		fs.mkdirSync(vaultPath);
		writeMarker(root, vaultPath);
		return assertOwnedVault(config);
	}
	if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`unsafe vault path: ${vaultPath}`);
	const marker = readMarker(vaultPath);
	if (markerMatches(marker, root, vaultPath)) return assertOwnedVault(config);
	if (marker) fail(`invalid vault marker: ${markerFile(vaultPath)}`);
	if (fs.readdirSync(vaultPath).length > 0) fail(`nonempty unowned vault: ${vaultPath}`);
	writeMarker(root, vaultPath);
	return assertOwnedVault(config);
}

export function validateConfigDir(config, configDir) {
	const vaultPath = assertOwnedVault(config);
	if (typeof configDir !== "string" || configDir.length === 0) fail("configDir is required");
	if (path.isAbsolute(configDir)) fail("configDir must be relative");
	const abs = safeChild(vaultPath, configDir);
	assertNoSymlinkComponents(abs, false);
	const stat = lstatOrNull(abs);
	if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) fail(`configDir is not a directory: ${abs}`);
	return abs;
}
