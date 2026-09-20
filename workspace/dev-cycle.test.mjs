import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { runCycle } from "./dev-cycle.mjs";
import { fakeObsidian, runtimeFixture } from "./dev-test-fixture.mjs";

function receipt(f) {
	return { vaultPath: f.config.vaultPath, configDir: f.configDir, pluginId: f.selection.pluginId, version: "1", commands: [] };
}

test("cycle runs stages in order and deploys to a custom runtime configDir with real deployment", async (t) => {
	const f = runtimeFixture(t, { configDir: "live-config" });
	fakeObsidian(t, f);
	const calls = [];
	const result = await runCycle(f.config, f.selection, {
		runBuild: async () => { calls.push("build"); },
		discoverRuntime: async () => { calls.push("discover"); return receipt(f); },
		reloadPlugin: async () => { calls.push("reload"); return receipt(f); },
		verifyPlugin: async () => { calls.push("verify"); return receipt(f); },
	});
	assert.deepEqual(calls, ["discover", "build", "reload", "verify"]);
	assert.equal(result.deployed.pluginDir, f.pluginDir);
	assert.equal(fs.readFileSync(path.join(f.pluginDir, "main.js"), "utf8"), "new main");
	assert.equal(fs.existsSync(path.join(f.config.vaultPath, ".dev-cycle.lock")), false);
});

test("cycle uses real discovery, deployment, reload, and verification without converting configDir to absolute", async (t) => {
	const f = runtimeFixture(t, { configDir: "live-config" });
	fakeObsidian(t, f, { staleVersion: "7.0.0" });
	const result = await runCycle(f.config, f.selection, { runBuild: async () => {} });
	assert.equal(result.runtime.configDir, "live-config");
	assert.equal(result.deployed.pluginDir, f.pluginDir);
	assert.equal(result.reloaded.version, "2.0.0");
	assert.deepEqual(result.verified.commands, ["sample-plugin:run"]);
});

test("cycle failures stop later stages and always release the exclusive lock", async (t) => {
	for (const failedStage of ["discover", "build", "deploy", "reload"]) await t.test(failedStage, async (t) => {
		const f = runtimeFixture(t);
		const calls = [];
		const stages = {
			discoverRuntime: async () => { calls.push("discover"); if (failedStage === "discover") throw new Error("discover failed"); return receipt(f); },
			runBuild: async () => { calls.push("build"); if (failedStage === "build") throw new Error("build failed"); },
			deployArtifacts: async () => { calls.push("deploy"); if (failedStage === "deploy") throw new Error("deploy failed"); return {}; },
			reloadPlugin: async () => { calls.push("reload"); if (failedStage === "reload") throw new Error("reload failed"); return receipt(f); },
			verifyPlugin: async () => { calls.push("verify"); return receipt(f); },
		};
		await assert.rejects(runCycle(f.config, f.selection, stages), new RegExp(`${failedStage} failed`));
		assert.equal(fs.existsSync(path.join(f.config.vaultPath, ".dev-cycle.lock")), false);
		assert.deepEqual(calls, {
			discover: ["discover"], build: ["discover", "build"], deploy: ["discover", "build", "deploy"], reload: ["discover", "build", "deploy", "reload"],
		}[failedStage]);
	});
});

test("cycle aborts before deployment and excludes an existing lock", async (t) => {
	await t.test("aborted", async (t) => {
		const f = runtimeFixture(t);
		const controller = new AbortController();
		controller.abort();
		const calls = [];
		await assert.rejects(runCycle(f.config, f.selection, {
			signal: controller.signal,
			discoverRuntime: async () => { calls.push("discover"); return receipt(f); },
			runBuild: async () => { calls.push("build"); },
			deployArtifacts: async () => { calls.push("deploy"); },
		}), /aborted/);
		assert.deepEqual(calls, ["discover"]);
		assert.equal(fs.existsSync(path.join(f.config.vaultPath, ".dev-cycle.lock")), false);
	});
	await t.test("existing lock", async (t) => {
		const f = runtimeFixture(t);
		const lock = path.join(f.config.vaultPath, ".dev-cycle.lock");
		fs.writeFileSync(lock, "other process\n");
		let built = false;
		await assert.rejects(runCycle(f.config, f.selection, {
			discoverRuntime: async () => receipt(f),
			runBuild: async () => { built = true; },
		}), /exclusive cycle lock exists/);
		assert.equal(built, false);
		assert.equal(fs.readFileSync(lock, "utf8"), "other process\n");
	});
});

test("cycle stops deployment when build aborts, but finishes a deployment that aborts its signal", async (t) => {
	await t.test("build abort", async (t) => {
		const f = runtimeFixture(t);
		const controller = new AbortController();
		const calls = [];
		await assert.rejects(runCycle(f.config, f.selection, {
			signal: controller.signal,
			discoverRuntime: async () => receipt(f),
			runBuild: async () => { calls.push("build"); controller.abort(); },
			deployArtifacts: async () => { calls.push("deploy"); },
		}), /aborted/);
		assert.deepEqual(calls, ["build"]);
		assert.equal(fs.existsSync(path.join(f.config.vaultPath, ".dev-cycle.lock")), false);
	});
	await t.test("deploy abort", async (t) => {
		const f = runtimeFixture(t);
		const controller = new AbortController();
		const calls = [];
		await runCycle(f.config, f.selection, {
			signal: controller.signal,
			discoverRuntime: async () => receipt(f),
			runBuild: async () => { calls.push("build"); },
			deployArtifacts: async () => { calls.push("deploy"); controller.abort(); return {}; },
			reloadPlugin: async (_config, _selection, _runtime, options) => { calls.push("reload"); assert.equal(options, undefined); return receipt(f); },
			verifyPlugin: async (_config, _selection, _runtime, options) => { calls.push("verify"); assert.equal(options, undefined); return receipt(f); },
		});
		assert.deepEqual(calls, ["build", "deploy", "reload", "verify"]);
		assert.equal(fs.existsSync(path.join(f.config.vaultPath, ".dev-cycle.lock")), false);
	});
});

test("verify failure releases the cycle lock", async (t) => {
	const f = runtimeFixture(t);
	await assert.rejects(runCycle(f.config, f.selection, {
		discoverRuntime: async () => receipt(f),
		runBuild: async () => {},
		deployArtifacts: async () => ({}),
		reloadPlugin: async () => receipt(f),
		verifyPlugin: async () => { throw new Error("verify failed"); },
	}), /verify failed/);
	assert.equal(fs.existsSync(path.join(f.config.vaultPath, ".dev-cycle.lock")), false);
});
