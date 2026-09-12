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

export const SOURCE = { alias: "m1-file", profileId: "default" };
export const PROFILE = { alias: "m1-file", profileId: "default", home: HERMES };
export const SETTINGS: ViewerSettings = {
  servers: ["m1-file"],
  selectedSources: ["m1-file\u0000default"],
  autoRefreshSeconds: 60,
  persistJobNames: true,
  historyLimit: 50,
};

export const ROOT = join(import.meta.dir, "..");
export const SRC = join(ROOT, "src");
export const VAULT_PLUGIN =
  "/Users/beomsu/Documents/Obsidian/Ataraxia/.obsidian/plugins/hermes-cron-viewer";
export const COMMUNITY =
  "/Users/beomsu/Documents/Obsidian/Ataraxia/.obsidian/community-plugins.json";

/** Plugins that were enabled before this plugin was added; none of these may disappear. */
export const PREEXISTING_COMMUNITY_PLUGINS = [
  "workspaces-plus", "templater-obsidian", "tag-wrangler", "obsidian-smart-typography",
  "remember-cursor-position", "homepage", "hot-reload", "obsidian-importer",
  "note-refactor-obsidian", "highlightr-plugin", "obsidian42-strange-new-worlds",
  "obsidian-excalidraw-plugin", "obsidian-copy-block-link", "omnisearch",
  "metadata-auto-classifier", "various-complements", "supercharged-links-obsidian",
  "obsidian-outliner", "obsidian-hider", "auto-mover", "obsidian-bible-search", "eagle",
  "timeline-for-bases", "obsidian42-brat", "note-player", "obsidian-minimal-settings",
  "obsidian-style-settings", "notebook-navigator", "url-into-selection",
  "obsidian-auto-link-title", "obsidian-linter", "dataview", "graph-styler",
] as const;


export function job(overrides: Partial<CronJobRecord> = {}): CronJobRecord {
  return {
    source: SOURCE,
    id: "job-a",
    name: "job-a",
    enabled: true,
    state: null,
    schedule: { kind: "cron", display: "daily", raw: "0 9 * * *" },
    nextRunAt: "2026-09-13T09:00:00+09:00",
    lastRunAt: "2026-09-12T09:00:00+09:00",
    lastStatus: "ok",
    lastStatusRaw: null,
    lastDeliveryUnverified: false,
    failureStreak: null,
    latestExecutionId: null,
    latestExecutionStatus: null,
    lastDispatch: {
      kind: "catch_up",
      scheduledAt: "2026-09-12T09:00:00+09:00",
      dispatchedAt: "2026-09-12T09:31:00+09:00",
      latenessSeconds: 1860,
    },
    prompt: "PROMPT-MUST-STAY-IN-MEMORY",
    lastError: "ERR-MUST-STAY-IN-MEMORY",
    lastDeliveryError: null,
    unparsedFields: [],
    ...overrides,
  };
}

export function persistedSnapshot(): PersistedSourceSnapshot {
  return projectSnapshot(
    {
      source: SOURCE,
      home: HERMES,
      jobs: [job()],
      transport: "connected",
      sourceStatus: "read",
      statusDetail: null,
      lastUpdatedAt: "2026-09-12T12:00:00Z",
      unparsedFields: [],
    },
    [],
    [],
    { persistJobNames: true },
  );
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else acc.push(path);
  }
  return acc;
}

export async function flushClick(handler: (() => void) | undefined): Promise<void> {
  handler?.();
  await new Promise((resolve) => setTimeout(resolve, 20));
}

export function gatewayFor(data: { current: Record<string, unknown> }): PluginDataGateway {
  return new PluginDataGateway({
    loadData: async () => data.current,
    saveData: async (next: unknown) => {
      data.current = next as Record<string, unknown>;
    },
  } as never);
}

export type { CronJobRecord } from "../src/types/hermes-cron";
export type { PersistedSourceSnapshot, ViewerSettings } from "../src/types/snapshot";
export type { RemoteRunner } from "../src/types/remote-command";
export { parseJobsJson } from "../src/domain/jobs-json-parser";
export { parseExecutionRows } from "../src/domain/execution-row-parser";
export { projectSnapshot } from "../src/domain/snapshot-projection";
export { rehydrateSnapshot } from "../src/domain/snapshot-restore";
export { isUsableRead } from "../src/domain/read-usability";
export { buildQueryExecutions } from "../src/domain/sqlite-select-builder";
export { collectRound, collectSource } from "../src/ui/hermes-snapshot-collector";
export { readExecutionHistory } from "../src/ui/execution-history-reader";
export { SnapshotDiskStore } from "../src/ui/snapshot-disk-store";
export { PluginDataGateway } from "../src/ui/plugin-data-gateway";
export { SourceStatusTracker } from "../src/ui/source-status-tracker";
export { SshReadOnlyAdapter } from "../src/ui/ssh-read-only-adapter";
export { ViewerState } from "../src/ui/viewer-state";
export { VerbatimMemoryStore } from "../src/ui/verbatim-memory-store";
export { Logger } from "../src/utils/logger";
export { fakeRunner, HERMES, HOME, JOBS_JSON } from "./remote-fixtures";
export { HermesCronViewerPlugin, JobDetailModal, PluginModule, fakeNode, modalBags } from "./obsidian-harness";
