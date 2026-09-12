import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import Module from "node:module";

const ROOT = join(import.meta.dir, "..");
const BUNDLE = join(ROOT, "main.js");

/** Minimal stand-in for the Obsidian runtime so the built bundle can be loaded outside the app. */
function obsidianStub() {
  class PluginStub {
    app: unknown;
    manifest: unknown;
    registered: string[] = [];
    commands: string[] = [];
    ribbons: string[] = [];
    settingTabs: unknown[] = [];
    constructor(app: unknown, manifest: unknown) {
      this.app = app;
      this.manifest = manifest;
    }
    registerView(type: string): void {
      this.registered.push(type);
    }
    addCommand(command: { id: string }): void {
      this.commands.push(command.id);
    }
    addRibbonIcon(_icon: string, title: string): unknown {
      this.ribbons.push(title);
      return {};
    }
    addSettingTab(tab: unknown): void {
      this.settingTabs.push(tab);
    }
    async loadData(): Promise<unknown> {
      return null;
    }
    async saveData(): Promise<void> {}
  }

  class ItemViewStub {}
  class ModalStub {}
  class PluginSettingTabStub {}
  class SettingStub {
    setName(): this { return this; }
    setDesc(): this { return this; }
    setHeading(): this { return this; }
    addText(): this { return this; }
    addToggle(): this { return this; }
    addButton(): this { return this; }
    addExtraButton(): this { return this; }
  }

  return {
    Plugin: PluginStub,
    ItemView: ItemViewStub,
    Modal: ModalStub,
    PluginSettingTab: PluginSettingTabStub,
    Setting: SettingStub,
    Notice: class {},
    setIcon: () => {},
  };
}

/** Load the built CJS bundle with `obsidian` resolved to the stub. */
function loadBundle(): { plugin: new (app: unknown, manifest: unknown) => Record<string, unknown> } {
  const source = readFileSync(BUNDLE, "utf8");
  const stub = obsidianStub();
  const requireShim = ((id: string) => {
    if (id === "obsidian") return stub;
    return createRequire(BUNDLE)(id);
  }) as unknown as NodeJS.Require;

  const module = { exports: {} as Record<string, unknown> };
  const compiled = new Function("exports", "require", "module", "__filename", "__dirname", source);
  compiled(module.exports, requireShim, module, BUNDLE, ROOT);

  const exported = (module.exports.default ?? module.exports) as new (
    app: unknown,
    manifest: unknown,
  ) => Record<string, unknown>;
  return { plugin: exported };
}

describe("built bundle", () => {
  test("loads under a stubbed Obsidian runtime and exports the plugin class", () => {
    const { plugin } = loadBundle();
    expect(typeof plugin).toBe("function");
    const instance = new plugin({}, { id: "hermes-cron-viewer" });
    expect(typeof instance.onload).toBe("function");
  });

  test("onload registers both views, the commands and the settings tab", async () => {
    const { plugin } = loadBundle();
    const instance = new plugin({ workspace: {} }, { id: "hermes-cron-viewer" }) as unknown as {
      onload: () => Promise<void>;
      registered: string[];
      commands: string[];
      ribbons: string[];
      settingTabs: unknown[];
    };

    await instance.onload();

    expect(instance.registered).toEqual([
      "hermes-cron-today-timeline",
      "hermes-cron-week-calendar",
    ]);
    expect(instance.commands).toEqual([
      "open-today-timeline",
      "open-week-calendar",
      "refresh-now",
      "open-settings",
    ]);
    expect(instance.ribbons).toEqual(["Hermes: Today", "Hermes: Settings"]);
    expect(instance.settingTabs).toHaveLength(1);
  });

  test("the bundle contains no cron mutation or hermes CLI invocation", () => {
    const source = readFileSync(BUNDLE, "utf8");
    for (const forbidden of [
      "hermes cron",
      "cron create",
      "cron remove",
      "cron pause",
      "cron resume",
      "immutable=1",
      "journal_mode",
      "StrictHostKeyChecking=no",
      "StrictHostKeyChecking=accept-new",
      "UserKnownHostsFile",
    ]) {
      expect(source.includes(forbidden)).toBe(false);
    }
    expect(source).toContain("sqlite3 -readonly -json");
    expect(source).toContain("StrictHostKeyChecking=yes");
  });
});
