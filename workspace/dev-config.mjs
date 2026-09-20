import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { assertNoSymlinkComponents } from "./dev-vault.mjs";

const VAULT_KEYS = ["OBSIDIAN_VAULT_PATH", "VAULT_PATH", "VAULT_PATHS"];
const STRIP_KEYS = ["NODE_OPTIONS", "NODE_PATH"];

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

function hasUnsafeSegments(value) {
	return value.split(/[/\\]/).some((segment) => segment === "." || segment === "..");
}

function resolveRoot(root) {
	if (typeof root !== "string" || root.length === 0) fail("workspace root is required");
	if (root.includes("\0") || hasUnsafeSegments(root)) fail(`unsafe root: ${root}`);
	const resolved = path.resolve(root);
	const stat = fs.lstatSync(resolved);
	if (stat.isSymbolicLink()) fail(`symlink root rejected: ${resolved}`);
	if (!stat.isDirectory()) fail(`root is not a directory: ${resolved}`);
	// Parent aliases such as macOS /var are safe once the root itself is checked.
	const canonical = fs.realpathSync(resolved);
	assertNoSymlinkComponents(canonical, true);
	return canonical;
}

function readDotEnv(root) {
	const envPath = path.join(root, ".env");
	const stat = lstatOrNull(envPath);
	if (!stat) return {};
	if (stat.isSymbolicLink() || !stat.isFile()) fail(`unsafe .env: ${envPath}`);
	return parseEnv(fs.readFileSync(envPath, "utf8"));
}

function assertDedicatedConfigured(raw, dedicated, label) {
	if (raw !== ".dev-vault" && raw !== dedicated) {
		fail(`unsafe ${label}; dedicated workbench vault is ${dedicated}`);
	}
}

export function loadConfig(root, env = process.env) {
	const resolvedRoot = resolveRoot(root);
	const dedicated = path.join(resolvedRoot, ".dev-vault");
	const merged = { ...readDotEnv(resolvedRoot), ...env };
	if (typeof merged.OBSIDIAN_VAULT_PATH !== "string" || merged.OBSIDIAN_VAULT_PATH.trim() === "") {
		fail("OBSIDIAN_VAULT_PATH is missing");
	}
	assertDedicatedConfigured(merged.OBSIDIAN_VAULT_PATH, dedicated, "OBSIDIAN_VAULT_PATH");
	if (merged.VAULT_PATH !== undefined) {
		assertDedicatedConfigured(merged.VAULT_PATH, dedicated, "VAULT_PATH");
	}
	if (merged.VAULT_PATHS !== undefined) {
		assertDedicatedConfigured(merged.VAULT_PATHS, dedicated, "VAULT_PATHS");
	}
	const vaultName = path.basename(dedicated);
	if (merged.VAULT_NAME !== undefined && merged.VAULT_NAME !== vaultName) {
		fail("conflicting VAULT_NAME");
	}
	assertNoSymlinkComponents(dedicated, false);
	const vaultStat = lstatOrNull(dedicated);
	if (vaultStat && (vaultStat.isSymbolicLink() || !vaultStat.isDirectory())) {
		fail(`vault path is not a directory: ${dedicated}`);
	}
	const forwarded = { ...merged };
	for (const key of STRIP_KEYS) delete forwarded[key];
	for (const key of VAULT_KEYS) forwarded[key] = dedicated;
	forwarded.VAULT_NAME = vaultName;
	return { root: resolvedRoot, vaultPath: dedicated, env: forwarded };
}
