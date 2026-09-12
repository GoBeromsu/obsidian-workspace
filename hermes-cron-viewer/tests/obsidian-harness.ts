import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CronJobRecord } from "../src/types/hermes-cron";
import type { PersistedSourceSnapshot, ViewerSettings } from "../src/types/snapshot";
import type { RemoteRunner } from "../src/types/remote-command";
import { parseJobsJson } from "../src/domain/jobs-json-parser";
import { parseExecutionRows } from "../src/domain/execution-row-parser";
import { projectSnapshot } from "../src/domain/snapshot-projection";
import { rehydrateSnapshot } from "../src/domain/snapshot-restore";
import { isUsableRead } from "../src/domain/read-usability";
import { buildQueryExecutions } from "../src/domain/sqlite-select-builder";
import { collectRound, collectSource } from "../src/ui/hermes-snapshot-collector";
import { readExecutionHistory } from "../src/ui/execution-history-reader";
import { SnapshotDiskStore } from "../src/ui/snapshot-disk-store";
import { PluginDataGateway } from "../src/ui/plugin-data-gateway";
import { SourceStatusTracker } from "../src/ui/source-status-tracker";
import { SshReadOnlyAdapter } from "../src/ui/ssh-read-only-adapter";
import { ViewerState } from "../src/ui/viewer-state";
import { VerbatimMemoryStore } from "../src/ui/verbatim-memory-store";
import { Logger } from "../src/utils/logger";
import { fakeRunner, HERMES, HOME, JOBS_JSON } from "./remote-fixtures";

export type Click = { text: string; handler: () => void };

export function fakeNode(bag: { texts: string[]; clicks: Click[] }): {
  text: string;
  empty(): void;
  addClass(): unknown;
  createEl(tag: string, opts?: { text?: string; cls?: string }): unknown;
  createDiv(opts?: { text?: string; cls?: string }): unknown;
  createSpan(opts?: { text?: string; cls?: string }): unknown;
  addEventListener(type: string, handler: () => void): void;
  setAttribute(): void;
} {
  const node = {
    text: "",
    empty() {
      bag.texts.length = 0;
      bag.clicks.length = 0;
    },
    addClass() {
      return node;
    },
    createEl(_tag: string, opts?: { text?: string; cls?: string }) {
      const child = fakeNode(bag);
      if (opts?.text !== undefined) {
        child.text = opts.text;
        bag.texts.push(opts.text);
      }
      return child;
    },
    createDiv(opts?: { text?: string; cls?: string }) {
      return node.createEl("div", opts);
    },
    createSpan(opts?: { text?: string; cls?: string }) {
      return node.createEl("span", opts);
    },
    addEventListener(_type: string, handler: () => void) {
      bag.clicks.push({ text: node.text, handler });
    },
    setAttribute() {},
  };
  return node;
}

export const modalBags = new WeakMap<object, { texts: string[]; clicks: Click[] }>();

export type MenuItemRecord = { title: string; icon: string; click: () => void };

/** Menus opened through the mocked `Menu`, in open order, with their built items. */
export const openedMenus: { items: MenuItemRecord[]; event: unknown }[] = [];

mock.module("obsidian", () => {
  class Plugin {
    app: unknown;
    manifest: unknown;
    constructor(app: unknown, manifest: unknown) {
      this.app = app;
      this.manifest = manifest;
    }
    async loadData(): Promise<unknown> {
      return null;
    }
    async saveData(_data: unknown): Promise<void> {}
    registerView(): void {}
    addCommand(): void {}
    addRibbonIcon(): unknown {
      return {};
    }
    addSettingTab(): void {}
  }
  class ItemView {
    constructor(_leaf?: unknown) {}
  }
  class Modal {
    contentEl: ReturnType<typeof fakeNode>;
    constructor(_app?: unknown) {
      const bag = { texts: [] as string[], clicks: [] as Click[] };
      this.contentEl = fakeNode(bag);
      modalBags.set(this, bag);
    }
  }
  class PluginSettingTab {
    constructor(_app?: unknown, _plugin?: unknown) {}
  }
  class Setting {
    setName(): this {
      return this;
    }
    setDesc(): this {
      return this;
    }
    setHeading(): this {
      return this;
    }
    addText(): this {
      return this;
    }
    addToggle(): this {
      return this;
    }
    addButton(): this {
      return this;
    }
    addExtraButton(): this {
      return this;
    }
  }
  class MenuItem {
    record: MenuItemRecord = { title: "", icon: "", click: () => {} };
    setTitle(title: string): this {
      this.record.title = title;
      return this;
    }
    setIcon(icon: string): this {
      this.record.icon = icon;
      return this;
    }
    onClick(handler: () => void): this {
      this.record.click = handler;
      return this;
    }
  }
  class Menu {
    items: MenuItemRecord[] = [];
    addItem(build: (item: MenuItem) => unknown): this {
      const item = new MenuItem();
      build(item);
      this.items.push(item.record);
      return this;
    }
    showAtMouseEvent(event: unknown): this {
      openedMenus.push({ items: this.items, event });
      return this;
    }
  }
  return {
    Plugin,
    Menu,
    MenuItem,
    ItemView,
    Modal,
    PluginSettingTab,
    Setting,
    Notice: class {},
    setIcon: () => {},
  };
});

export const { JobDetailModal } = await import("../src/ui/job-detail-modal");
export const PluginModule = await import("../src/main");
export const HermesCronViewerPlugin = PluginModule.default;
