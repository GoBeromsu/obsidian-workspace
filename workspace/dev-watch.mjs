import { lstatSync, realpathSync, watch } from 'node:fs';
import { join, sep } from 'node:path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'release']);
const INPUT_ARTIFACTS = new Set(['styles.css', 'manifest.json']);

function posixRel(filename) {
	return String(filename).replaceAll('\\', '/');
}

function isRelevant(rel) {
	return (
		rel === 'package.json' ||
		rel === 'manifest.json' ||
		rel === 'styles.css' ||
		rel === 'tsconfig.json' ||
		rel === 'esbuild.config.mjs' ||
		rel.startsWith('src/') ||
		rel.startsWith('scripts/')
	);
}

function isLinkOrEscape(repoPath, rel) {
	const rootReal = realpathSync(repoPath);
	let current = repoPath;
	for (const part of rel.split('/')) {
		current = join(current, part);
		let stat;
		try {
			stat = lstatSync(current);
		} catch {
			return false;
		}
		if (stat.isSymbolicLink()) return true;
	}
	try {
		const real = realpathSync(current);
		return real !== rootReal && !real.startsWith(rootReal + sep);
	} catch {
		return false;
	}
}

function shouldIgnore(repoPath, filename, artifactFiles) {
	const rel = posixRel(filename);
	if (!rel) return true;
	const parts = rel.split('/');
	const base = parts[parts.length - 1];
	if (parts.some((part) => IGNORED_DIRS.has(part))) return true;
	if (base === '.env' || base.startsWith('.env.') || base.endsWith('.map')) return true;
	if (artifactFiles.includes(rel) && !INPUT_ARTIFACTS.has(base)) return true;
	if (isLinkOrEscape(repoPath, rel)) return true;
	return !isRelevant(rel);
}

export function createSerialRunner(run, onError) {
	let stopped = false;
	let pending = false;
	let scheduled = false;
	let active = false;
	let tail = Promise.resolve();
	const waiters = [];

	const flushIdle = () => {
		if (active || pending || scheduled) return;
		while (waiters.length > 0) waiters.shift()();
	};

	const enqueue = () => {
		if (scheduled) return;
		scheduled = true;
		tail = tail.then(async () => {
			scheduled = false;
			if (stopped || !pending) {
				flushIdle();
				return;
			}
			pending = false;
			active = true;
			try {
				await run();
			} catch (error) {
				try {
					await onError?.(error);
				} catch {}
			} finally {
				active = false;
			}
			if (!stopped && pending) enqueue();
			else flushIdle();
		});
	};

	return {
		request() {
			if (stopped) return;
			pending = true;
			enqueue();
		},
		async stop() {
			stopped = true;
			pending = false;
			await tail;
			flushIdle();
		},
		idle() {
			if (!active && !pending && !scheduled) return Promise.resolve();
			return new Promise((resolve) => waiters.push(resolve));
		},
	};
}

export function watchPlugin(selection, run, { onError, signal, watchFactory = watch } = {}) {
	const runner = createSerialRunner(run, onError);
	const artifacts = selection.artifactFiles ?? [];
	let stoppedError;
	let resolveDone;
	const done = new Promise((resolve) => {
		resolveDone = resolve;
	});
	const watcher = watchFactory(selection.repoPath, { recursive: true }, (_event, filename) => {
		try {
			if (filename == null) return;
			if (shouldIgnore(selection.repoPath, filename, artifacts)) return;
			runner.request();
		} catch (error) {
			void fail(error);
		}
	});

	let stopping;
	let reportedWatcherError = false;
	const stop = async () => {
		if (stopping) return stopping;
		stopping = (async () => {
			signal?.removeEventListener('abort', onAbort);
			watcher.close();
			await runner.stop();
			resolveDone({ error: stoppedError });
		})();
		return stopping;
	};
	const fail = async (error) => {
		if (reportedWatcherError) return;
		reportedWatcherError = true;
		stoppedError = error;
		const stopping = stop();
		try {
			await onError?.(error);
		} catch {}
		await stopping;
	};
	const onAbort = () => {
		void stop();
	};
	watcher.on('error', (error) => {
		void fail(error);
	});

	if (signal?.aborted) void stop();
	else signal?.addEventListener('abort', onAbort, { once: true });

	return {
		request() {
			runner.request();
		},
		stop,
		done,
	};
}
