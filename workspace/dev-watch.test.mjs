import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { watchPlugin } from "./dev-watch.mjs";

function fixture(t) {
	const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "dev-watch-"));
	t.after(() => fs.rmSync(repoPath, { recursive: true, force: true }));
	return { repoPath: fs.realpathSync(repoPath), artifactFiles: ["main.js", "styles.css", "manifest.json"] };
}

function fakeWatcher() {
	const watcher = new EventEmitter();
	watcher.closed = false;
	watcher.close = () => { watcher.closed = true; };
	let callback;
	return {
		watchFactory(_path, _options, listener) {
			callback = listener;
			return watcher;
		},
		change(filename) { callback("change", filename); },
		watcher,
	};
}

function nextTurn() {
	return new Promise((resolve) => setImmediate(resolve));
}

test("watcher ignores generated paths and runs each source, script, and esbuild input", async (t) => {
	const source = fakeWatcher();
	const selection = fixture(t);
	let cycles = 0;
	const handle = watchPlugin(selection, async () => {
		cycles += 1;
	}, { watchFactory: source.watchFactory });
	for (const filename of ["main.js", "artifacts/output.js", ".git/HEAD", "node_modules/x.js"]) source.change(filename);
	await nextTurn();
	assert.equal(cycles, 0);
	for (const filename of ["src/main.ts", "scripts/build.mjs", "esbuild.config.mjs"]) {
		source.change(filename);
		await nextTurn();
		assert.equal(cycles, ["src/main.ts", "scripts/build.mjs", "esbuild.config.mjs"].indexOf(filename) + 1);
	}
	await handle.stop();
});

test("watcher coalesces a burst during active work into exactly one later cycle", { timeout: 5_000 }, async (t) => {
	const source = fakeWatcher();
	const selection = fixture(t);
	let releaseFirst;
	let secondRun;
	const secondStarted = new Promise((resolve) => { secondRun = resolve; });
	let runs = 0;
	const first = new Promise((resolve) => { releaseFirst = resolve; });
	const handle = watchPlugin(selection, async () => {
		runs += 1;
		if (runs === 1) await first;
		else secondRun();
	}, { watchFactory: source.watchFactory });
	source.change("src/main.ts");
	await nextTurn();
	source.change("src/other.ts");
	source.change("scripts/build.mjs");
	source.change("esbuild.config.mjs");
	releaseFirst();
	await secondStarted;
	await nextTurn();
	assert.equal(runs, 2);
	await handle.stop();
});

test("watcher stop waits for active work and cancels pending work", { timeout: 5_000 }, async (t) => {
	const source = fakeWatcher();
	const selection = fixture(t);
	let release;
	let started = 0;
	const first = new Promise((resolve) => { release = resolve; });
	const handle = watchPlugin(selection, async () => {
		started += 1;
		if (started === 1) await first;
	}, { watchFactory: source.watchFactory });
	source.change("src/main.ts");
	await nextTurn();
	source.change("src/other.ts");
	const stopping = handle.stop();
	assert.equal(started, 1);
	release();
	await stopping;
	assert.equal(started, 1);
});

test("watcher errors report once, close the watcher, and settle the handle", async (t) => {
	const source = fakeWatcher();
	const selection = fixture(t);
	const errors = [];
	const handle = watchPlugin(selection, async () => {}, {
		watchFactory: source.watchFactory,
		onError(error) { errors.push(error.message); },
	});
	source.watcher.emit("error", new Error("watch failed"));
	source.watcher.emit("error", new Error("again"));
	const result = await handle.done;
	assert.equal(source.watcher.closed, true);
	assert.deepEqual(errors, ["watch failed"]);
	assert.equal(result.error.message, "watch failed");
});

test("real watcher detects a source change and stop settles active work", { timeout: 5_000 }, async (t) => {
	const selection = fixture(t);
	fs.mkdirSync(path.join(selection.repoPath, "src"));
	const input = path.join(selection.repoPath, "src", "input.ts");
	fs.writeFileSync(input, "export const revision = 0;\n");
	let cycles = 0;
	let release;
	let observeRun;
	const observedRun = new Promise((resolve) => { observeRun = resolve; });
	const activeCycle = new Promise((resolve) => { release = resolve; });
	const handle = watchPlugin(selection, async () => {
		cycles += 1;
		observeRun();
		await activeCycle;
	});
	let retryTimer;
	t.after(async () => {
		clearTimeout(retryTimer);
		release();
		await handle.stop();
	});
	await nextTurn();
	let revision = 0;
	let observed = false;
	const waitForRun = observedRun.then(() => {
		observed = true;
	});
	const poke = () => {
		if (observed) return;
		fs.writeFileSync(input, `export const revision = ${++revision};\n`);
		if (revision < 30) retryTimer = setTimeout(poke, 100);
	};
	poke();
	await waitForRun;
	clearTimeout(retryTimer);
	const stopping = handle.stop();
	release();
	await stopping;
	await nextTurn();
	assert.equal(cycles, 1);
});
