import assert from "node:assert/strict";
import test from "node:test";
import { discoverRuntime, reloadPlugin, verifyPlugin } from "./dev-runtime.mjs";
import { fakeObsidian, runtimeFixture } from "./dev-test-fixture.mjs";

test("runtime receipts preserve custom vault-relative configDir through discovery, reload, and verification", async (t) => {
	const f = runtimeFixture(t, { configDir: "live-config" });
	const fake = fakeObsidian(t, f, { version: "3.4.5", commands: ["sample-plugin:run"] });
	const runtime = await discoverRuntime(f.config);
	assert.deepEqual(runtime, { vaultPath: f.config.vaultPath, configDir: "live-config", pluginId: undefined, version: null, commands: [] });
	const reloaded = await reloadPlugin(f.config, f.selection, runtime);
	const verified = await verifyPlugin(f.config, f.selection, reloaded);
	assert.equal(reloaded.configDir, "live-config");
	assert.equal(reloaded.pluginId, "sample-plugin");
	assert.equal(reloaded.version, "2.0.0");
	assert.equal(verified.pluginId, "sample-plugin");
	assert.equal(verified.version, "2.0.0");
	assert.deepEqual(verified.commands, ["sample-plugin:run"]);
	assert.deepEqual(fake.readState().enabledPlugins, ["sample-plugin"]);
});

test("runtime rejects wrong vault identities and unsafe config directories", async (t) => {
	await t.test("wrong CLI vault", async (t) => {
		const f = runtimeFixture(t);
		fakeObsidian(t, f, { vaultPath: `${f.config.vaultPath}-other` });
		await assert.rejects(discoverRuntime(f.config), /vault path mismatch/);
	});
	await t.test("wrong runtime receipt vault rejects before plugin mutation", async (t) => {
		const f = runtimeFixture(t);
		const fake = fakeObsidian(t, f);
		await assert.rejects(reloadPlugin(f.config, f.selection, { ...await discoverRuntime(f.config), vaultPath: `${f.config.vaultPath}-other` }), /runtime vaultPath mismatch/);
		assert.equal(fake.readState().mutations ?? 0, 0);
	});
	for (const configDir of ["../outside", "/outside", ""]) await t.test(`configDir ${JSON.stringify(configDir)}`, async (t) => {
		const f = runtimeFixture(t);
		fakeObsidian(t, f, { configDir });
		await assert.rejects(discoverRuntime(f.config), /relative|configDir/);
	});
});

test("runtime reports malformed, absent, and failed CLI receipts", async (t) => {
	for (const mode of ["missing", "malformed"]) await t.test(mode, async (t) => {
		const f = runtimeFixture(t);
		fakeObsidian(t, f, { mode });
		await assert.rejects(discoverRuntime(f.config), mode === "malformed" ? /invalid JSON sentinel/ : undefined);
	});
	for (const mode of ["failed", "nonzero-success"]) await t.test(mode, async (t) => {
		const f = runtimeFixture(t);
		fakeObsidian(t, f, { mode });
		await assert.rejects(discoverRuntime(f.config), /Command failed/);
	});
});

test("runtime abort rejects even when the fake CLI would later emit a success receipt", async (t) => {
	const f = runtimeFixture(t);
	fakeObsidian(t, f, { mode: "delayed-success" });
	const controller = new AbortController();
	const pending = discoverRuntime(f.config, { signal: controller.signal });
	controller.abort();
	await assert.rejects(pending, /aborted/);
});

test("reload rejects configDir drift before mutating plugin state", async (t) => {
	const f = runtimeFixture(t);
	const fake = fakeObsidian(t, f, { drift: "changed-config", expectedConfigDir: "live-config" });
	const runtime = await discoverRuntime(f.config);
	await assert.rejects(reloadPlugin(f.config, f.selection, runtime), /Command failed/);
	assert.equal(fake.readState().mutations ?? 0, 0);
});

test("reload refreshes the selected manifest and reports only selected plugin commands", async (t) => {
	const f = runtimeFixture(t);
	fakeObsidian(t, f, { staleVersion: "1.0.0", commands: ["sample-plugin:run", "other-plugin:ignored"] });
	const runtime = await discoverRuntime(f.config);
	const reloaded = await reloadPlugin(f.config, f.selection, runtime);
	assert.equal(reloaded.version, "2.0.0");
	assert.deepEqual(reloaded.commands, ["sample-plugin:run"]);
});
