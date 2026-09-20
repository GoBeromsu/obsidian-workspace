#!/usr/bin/env node
// Materialise the linked plugin clones described by plugins.manifest.json.
//
// Plugin directories are gitignored independent clones, not submodules.
// This script only clones what is missing; an existing checkout is reported
// and never fetched, pulled, checked out or deleted.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(workspaceRoot, "workspace", "plugins.manifest.json");

const git = (args, cwd = workspaceRoot) =>
	execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const linked = manifest.plugins.filter(plugin => plugin.repo_kind !== "root-local");

let cloned = 0;
let failed = 0;

for (const { name, repo_path, repo_slug, git_branch } of linked) {
	const target = join(workspaceRoot, repo_path);

	if (existsSync(target)) {
		try {
			const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], target);
			const head = git(["rev-parse", "--short", "HEAD"], target);
			console.log(`present  ${repo_path} (${branch} @ ${head})`);
		} catch {
			console.log(`present  ${repo_path} (not a git checkout)`);
		}
		continue;
	}

	try {
		git(["clone", "--branch", git_branch, `https://github.com/${repo_slug}.git`, repo_path]);
		console.log(`cloned   ${repo_path} <- ${repo_slug}@${git_branch}`);
		cloned += 1;
	} catch (error) {
		console.error(`FAILED   ${repo_path} <- ${repo_slug}@${git_branch}: ${error.message.trim()}`);
		failed += 1;
	}
}

console.log(`\n${linked.length} linked plugins — ${cloned} cloned, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
