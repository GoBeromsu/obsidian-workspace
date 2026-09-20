import { spawn } from 'node:child_process';
import process from 'node:process';
import { basename } from 'node:path';
import { assertExecutable } from './dev-selection.mjs';

const ESCALATE_MS = 2000;

function abortError() {
	const error = new Error('build aborted');
	error.name = 'AbortError';
	return error;
}

function sanitizeEnv(env) {
	const out = {};
	for (const [key, value] of Object.entries(env ?? {})) {
		if (key !== 'NODE_OPTIONS' && key !== 'NODE_PATH' && typeof value === 'string') out[key] = value;
	}
	const vault = out.OBSIDIAN_VAULT_PATH || out.VAULT_PATH || out.VAULT_PATHS;
	if (vault) {
		out.OBSIDIAN_VAULT_PATH = vault;
		out.VAULT_PATH = vault;
		out.VAULT_PATHS = vault;
		out.VAULT_NAME = basename(vault);
	}
	return out;
}

function signalProcess(child, signal) {
	if (!child?.pid) return;
	try {
		if (process.platform === 'win32') child.kill(signal);
		else process.kill(-child.pid, signal);
	} catch {
		try {
			child.kill(signal);
		} catch {}
	}
}

function killProcessTree(child) {
	if (!child?.pid || child.exitCode != null || child.signalCode != null) return;
	signalProcess(child, 'SIGTERM');
	const timer = setTimeout(() => {
		if (child.exitCode == null && child.signalCode == null) signalProcess(child, 'SIGKILL');
	}, ESCALATE_MS);
	timer.unref?.();
	child.once('exit', () => clearTimeout(timer));
}

export function runBuild(selection, env, { signal } = {}) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(abortError());
			return;
		}

		try {
			assertExecutable(selection);
		} catch (error) {
			reject(error);
			return;
		}

		let child;
		let done = false;
		const finish = (fn) => {
			if (done) return;
			done = true;
			signal?.removeEventListener('abort', onAbort);
			fn();
		};
		const onAbort = () => killProcessTree(child);

		try {
			child = spawn(selection.command, selection.args, {
				cwd: selection.repoPath,
				env: sanitizeEnv(env),
				stdio: ['ignore', 'inherit', 'inherit'],
				shell: false,
				detached: process.platform !== 'win32',
				windowsHide: true,
			});
		} catch (error) {
			reject(error);
			return;
		}

		signal?.addEventListener('abort', onAbort, { once: true });
		if (signal?.aborted) onAbort();
		child.on('error', (error) => finish(() => reject(error)));
		child.on('exit', (code, deathSignal) => {
			if (signal?.aborted) finish(() => reject(abortError()));
			else if (code === 0) finish(() => resolve());
			else finish(() => reject(new Error(`build failed: ${code == null ? deathSignal : `exit ${code}`}`)));
		});
	});
}
