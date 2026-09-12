import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(import.meta.dir, "..");
const BUNDLE = join(ROOT, "main.js");
const SRC = join(ROOT, "src");

// A SQLite `file:` URI always has a non-whitespace path/authority character right
// after the scheme colon. Prose such as "changes the file: no atomicity" does not.
const SQLITE_FILE_URI = /file:\S/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else acc.push(path);
  }
  return acc;
}

function logicLoc(text: string): number {
  let loc = 0;
  let inBlock = false;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes("*/")) inBlock = false;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlock = true;
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    loc += 1;
  }
  return loc;
}

describe("built bundle mutation surface (AC12 / AC21)", () => {
  test("main.js contains no cron mutation, hermes CLI, URI sqlite, or weakened host-key options", () => {
    const source = readFileSync(BUNDLE, "utf8");
    for (const forbidden of [
      "hermes cron",
      "cron create",
      "cron remove",
      "cron pause",
      "cron resume",
      "cron run",
      "immutable=1",
      "nolock=1",
      "vfs=",
      "journal_mode",
      "StrictHostKeyChecking=no",
      "StrictHostKeyChecking=accept-new",
      "UserKnownHostsFile",
    ]) {
      expect(source.includes(forbidden)).toBe(false);
    }
    expect(SQLITE_FILE_URI.test(source)).toBe(false);
    expect(source).toContain("sqlite3 -readonly -json");
    expect(source).toContain("StrictHostKeyChecking=yes");
  });

  test("file: URI detector matches real SQLite URIs but not prose", () => {
    for (const uri of ["file:/tmp/x.db", "file:relative.db?mode=ro", "file::memory:"]) {
      expect(SQLITE_FILE_URI.test(uri)).toBe(true);
    }
    expect(SQLITE_FILE_URI.test("// changes the file: no atomicity guarantees")).toBe(false);
  });

  test("loads under a stubbed Obsidian runtime without registering mutation commands", async () => {
    const source = readFileSync(BUNDLE, "utf8");
    const commands: string[] = [];
    const stub = {
      Plugin: class {
        app: unknown;
        manifest: unknown;
        constructor(app: unknown, manifest: unknown) {
          this.app = app;
          this.manifest = manifest;
        }
        registerView(): void {}
        addCommand(command: { id: string }): void { commands.push(command.id); }
        addRibbonIcon(): unknown { return {}; }
        addSettingTab(): void {}
        async loadData(): Promise<unknown> { return null; }
        async saveData(): Promise<void> {}
      },
      ItemView: class {},
      Modal: class {},
      PluginSettingTab: class {},
      Setting: class {
        setName(): this { return this; }
        setDesc(): this { return this; }
        setHeading(): this { return this; }
        addText(): this { return this; }
        addToggle(): this { return this; }
        addButton(): this { return this; }
        addExtraButton(): this { return this; }
      },
      Notice: class {},
      setIcon: () => {},
    };
    const requireShim = ((id: string) => {
      if (id === "obsidian") return stub;
      return createRequire(BUNDLE)(id);
    }) as unknown as NodeJS.Require;
    const module = { exports: {} as Record<string, unknown> };
    const compiled = new Function("exports", "require", "module", "__filename", "__dirname", source);
    compiled(module.exports, requireShim, module, BUNDLE, ROOT);
    const Plugin = (module.exports.default ?? module.exports) as new (
      app: unknown,
      manifest: unknown,
    ) => { onload: () => Promise<void> };
    await new Plugin({ workspace: {} }, { id: "hermes-cron-viewer" }).onload();
    expect(commands.sort()).toEqual(["open-settings", "open-today-timeline", "open-week-calendar", "refresh-now"]);
    expect(commands.some((id) => /create|delete|pause|resume|run/.test(id))).toBe(false);
  });

  test("runtime sources stay inside 200 LOC, with no innerHTML, .obsidian literal, or hardcoded colors", () => {
    const files = walk(SRC).filter((path) => path.endsWith(".ts"));
    const over: string[] = [];
    const hits: string[] = [];
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      if (logicLoc(text) > 200) over.push(path);
      if (/\.innerHTML\b/.test(text)) hits.push(`innerHTML:${path}`);
      if (/(['"`])\.obsidian\1/.test(text)) hits.push(`obsidian:${path}`);
      if (/#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(/.test(text)) hits.push(`color:${path}`);
    }
    expect(over).toEqual([]);
    expect(hits).toEqual([]);
  });
});
