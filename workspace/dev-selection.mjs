import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';
import process from 'node:process';

const MANIFEST_REL = join('workspace', 'plugins.manifest.json');
const BUILD_SCRIPT = 'scripts/esbuild.build.mjs';
const BUILD_CONFIG = 'scripts/esbuild.config.mjs';
const AUDITED_ID = 'eagle';
const AUDITED_REPO = 'obsidian-eagle-plugin';
const PLUGIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEPLOY_ARTIFACTS = new Set(['main.js', 'manifest.json', 'styles.css']);
const HASHES = {
	[BUILD_SCRIPT]: '300a504f37cd33b05bd7071760450f94dd7f67b74b21b28b6e479fd8ca2fe186',
	[BUILD_CONFIG]: '27c696c8a5f502f067f374bb43925b30f997f49116ae94697ca4b7d47a7cb55c',
};

function fail(message) {
	throw new Error(message);
}

function inside(parent, child) {
	const prefix = parent.endsWith(sep) ? parent : parent + sep;
	return child === parent || child.startsWith(prefix);
}

function realInside(parent, child) {
	const resolved = realpathSync(child);
	if (!inside(realpathSync(parent), resolved)) fail(`symlink escape: ${child}`);
	return resolved;
}

function assertSafeId(id) {
	if (typeof id !== 'string' || !PLUGIN_ID.test(id)) fail(`unsafe plugin id: ${id}`);
}

function assertSafeSegment(value, label) {
	if (typeof value !== 'string' || value.length === 0) fail(`unsafe ${label}: ${value}`);
	if (isAbsolute(value) || value.includes('\0') || value.includes('..')) fail(`path traversal: ${value}`);
	if (value !== basename(value) || value === '.') fail(`path traversal: ${value}`);
}

function assertSafeRel(value) {
	if (typeof value !== 'string' || value.length === 0) fail(`path traversal: ${value}`);
	const normalized = value.replaceAll('\\', '/');
	if (isAbsolute(value) || normalized.startsWith('/') || normalized.includes('\0')) fail(`path traversal: ${value}`);
	if (normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
		fail(`path traversal: ${value}`);
	}
	return normalized;
}

function readJson(path, message) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		fail(message);
	}
}

function findPlugin(manifest, selector) {
	if (typeof selector !== 'string' || selector.length === 0 || selector.includes('\0')) {
		fail(`unsafe plugin id: ${selector}`);
	}
	if (selector.includes('..') || isAbsolute(selector)) fail(`path traversal: ${selector}`);
	const plugins = Array.isArray(manifest?.plugins) ? manifest.plugins : [];
	const matches = plugins.filter((plugin) => plugin.plugin_id === selector || plugin.repo_path === selector);
	if (matches.length !== 1) fail(`unknown plugin selector: ${selector}`);
	return matches[0];
}

function resolveRepo(rootPath, repoPath) {
	assertSafeSegment(repoPath, 'repo_path');
	const candidate = join(rootPath, repoPath);
	if (!existsSync(candidate)) fail(`missing plugin repository: ${repoPath}`);
	const stat = lstatSync(candidate);
	if (stat.isSymbolicLink()) {
		const real = realpathSync(candidate);
		if (!inside(rootPath, real) || !statSync(real).isDirectory()) fail(`symlink escape: ${repoPath}`);
		return real;
	}
	if (!stat.isDirectory()) fail(`missing plugin repository: ${repoPath}`);
	return realpathSync(candidate);
}

function assertContainedFile(repoPath, rel) {
	const normalized = assertSafeRel(rel);
	let current = repoPath;
	for (const part of normalized.split('/')) {
		current = join(current, part);
		if (!existsSync(current)) fail('altered package/build contract');
		const stat = lstatSync(current);
		if (stat.isSymbolicLink()) {
			const real = realpathSync(current);
			if (!inside(realpathSync(repoPath), real)) fail(`symlink escape: ${rel}`);
		}
	}
	realInside(repoPath, current);
	return current;
}

function selectArtifacts(repoPath, files) {
	if (!Array.isArray(files) || files.length === 0) fail('altered package/build contract');
	const selected = [];
	const seen = new Set();
	for (const file of files) {
		const normalized = assertSafeRel(file);
		const absolute = join(repoPath, normalized);
		if (existsSync(absolute)) realInside(repoPath, absolute);
		const name = basename(normalized);
		if (!DEPLOY_ARTIFACTS.has(name) || seen.has(name)) continue;
		seen.add(name);
		selected.push(name);
	}
	if (!seen.has('main.js') || !seen.has('manifest.json')) fail('altered package/build contract');
	return selected;
}

function assertEagleContract(repoPath) {
	const pkg = readJson(join(repoPath, 'package.json'), 'altered package/build contract');
	if (pkg.type !== 'module' || pkg.main !== 'main.js') fail('altered package/build contract');
	if (pkg.scripts?.build !== 'node scripts/esbuild.build.mjs production') fail('altered package/build contract');
	if (typeof pkg.scripts?.dev === 'string' && pkg.scripts.dev.includes('dotenv')) fail('altered package/build contract');
	if (!pkg.devDependencies?.esbuild && !pkg.dependencies?.esbuild) fail('missing dependency: esbuild');
	for (const rel of Object.keys(HASHES)) {
		const absolute = assertContainedFile(repoPath, rel);
		const digest = createHash('sha256').update(readFileSync(absolute)).digest('hex');
		if (digest !== HASHES[rel]) fail('altered package/build contract');
	}
}

function assertEsbuild(repoPath) {
	const esbuildPkg = join(repoPath, 'node_modules', 'esbuild', 'package.json');
	if (!existsSync(esbuildPkg)) fail('missing dependency: esbuild');
	realInside(repoPath, esbuildPkg);
}

export function assertExecutable(selection) {
	if (selection?.command !== process.execPath) fail('altered package/build contract');
	const args = selection.args;
	if (!Array.isArray(args) || args.length !== 2 || args[0] !== BUILD_SCRIPT || args[1] !== 'production') {
		fail('altered package/build contract');
	}
	assertEagleContract(selection.repoPath);
	assertEsbuild(selection.repoPath);
}

export function selectPlugin(root, selector) {
	if (typeof root !== 'string' || root.length === 0) fail('path traversal: root');
	const rootPath = realpathSync(resolve(root));
	const manifestPath = join(rootPath, MANIFEST_REL);
	if (!existsSync(manifestPath)) fail('missing workspace manifest');
	const plugin = findPlugin(readJson(manifestPath, 'missing workspace manifest'), selector);
	assertSafeId(plugin.plugin_id);
	assertSafeSegment(plugin.repo_path, 'repo_path');
	if (plugin.plugin_id !== AUDITED_ID || plugin.repo_path !== AUDITED_REPO) {
		fail(`unsupported plugin build: ${plugin.plugin_id}`);
	}
	const repoPath = resolveRepo(rootPath, plugin.repo_path);
	const artifactFiles = selectArtifacts(repoPath, plugin.artifact_files);
	assertEagleContract(repoPath);
	assertEsbuild(repoPath);
	return {
		repoPath,
		pluginId: plugin.plugin_id,
		artifactFiles,
		command: process.execPath,
		args: [BUILD_SCRIPT, 'production'],
	};
}
