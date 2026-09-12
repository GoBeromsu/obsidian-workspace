import type { RejectionCode } from "./remote-command";
import type { RemoteRunner } from "./remote-command";
import type { ProfileRef } from "./hermes-cron";
import type { ProfileDocumentName } from "./profile-document";
import type { LedgerReadResult, SourceSnapshot } from "./snapshot";

/** Profile candidates offered by the settings tab, before any per-server grouping. */
export interface ProfileGroupSources {
  readonly servers: readonly string[];
  /** Profiles already known without a live probe: selected sources and restored snapshots. */
  readonly known: readonly ProfileRef[];
  /** Profiles listed by this session's discovery, per server alias. */
  readonly discovered: ReadonlyMap<string, readonly ProfileRef[]>;
}

/** Everything the shared profile section needs; the settings tab owns persistence and the editor. */
export interface ProfileSectionOptions {
  readonly sources: ProfileGroupSources;
  readonly isSelected: (profile: ProfileRef) => boolean;
  readonly onToggle: (profile: ProfileRef, selected: boolean) => Promise<void>;
  readonly onEditDocument: (profile: ProfileRef, name: ProfileDocumentName) => void;
}

/** Obsidian's runtime settings controller, which is not exposed by all public type versions. */
export interface ObsidianSettingsAccess {
  readonly setting: {
    open(): void;
    openTabById(id: string): void;
  };
}

/** Result of validating one remote token or path. */
export type TokenCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: RejectionCode; readonly detail: string };

/** Everything the server section renders; the settings tab owns persistence and the modals. */
export interface ServerSectionOptions {
  readonly servers: readonly string[];
  /** Status line for one server, already falling back to the not-checked-yet text. */
  statusOf(alias: string): string;
  /** True while a connection check for that server is in flight. */
  isBusy(alias: string): boolean;
  onAdd(alias: string): void;
  onEdit(alias: string): void;
  onCheck(alias: string): void;
  onRemove(alias: string): void;
}

/** Outcome of a connection target replacement; `changed: false` means the target was identical. */
export type TargetChangeResult =
  | { readonly ok: true; readonly changed: boolean }
  | { readonly ok: false; readonly reason: "invalid" | "duplicate" | "unknown" };

/** Outcome of a native timestamp resolution. */
export type ResolvedInstant =
  /** Offset present: the absolute instant is known and may be placed in local time. */
  | { readonly kind: "absolute"; readonly epochMs: number; readonly raw: string }
  /** Parseable shape without an offset: displayed verbatim, never placed. */
  | { readonly kind: "timezone-unknown"; readonly raw: string }
  /** Not a timestamp this build understands: displayed verbatim. */
  | { readonly kind: "unparsed"; readonly raw: string };

/** Presentation options for one overview timestamp. `timeZone` is an IANA zone, default local. */
export interface OverviewInstantOptions {
  readonly timeZone?: string;
  readonly unavailable?: string;
}

/** One overview timestamp, split into a prominent clock and a secondary context line. */
export interface OverviewInstant {
  /** `absolute`: placed in local time. `verbatim`: shown as stored. `unavailable`: nothing stored. */
  readonly kind: "absolute" | "verbatim" | "unavailable";
  /** `HH:mm`, only when the absolute instant is known. */
  readonly clock: string | null;
  /** Date and timezone, or the reason no clock is shown. */
  readonly context: string;
  /** The exact stored text, unmodified. */
  readonly raw: string | null;
  /** Hover/accessible text carrying the exact stored text. */
  readonly title: string;
}

/** Local-time parts used for calendar placement. */
export interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  /** Minutes since local midnight, the vertical axis coordinate. */
  readonly minutesOfDay: number;
  /** `YYYY-MM-DD` in local time. */
  readonly dayKey: string;
}

/** A payload bounded to the application-side prefix limit. */
export interface BoundedResponse {
  readonly bytes: Uint8Array;
  readonly capExceeded: boolean;
}

/** Acceptance decision for a structured payload. */
export type StructuredAcceptance<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: "cap-exceeded" | "parse-failed"; readonly detail: string };

/** Disk projection options. */
export interface ProjectionOptions {
  /** Job names come from Hermes and may echo prompt text, so persisting them is opt-out. */
  readonly persistJobNames: boolean;
}

/** Per-source round result plus the cron listing and ledger availability. */
export interface CollectedSource {
  readonly snapshot: SourceSnapshot;
  readonly cronEntries: readonly string[];
  /** Ledger availability for this source, refreshed every round (plan section 8: R3+R4+R7). */
  readonly ledger: LedgerReadResult;
}

/** Injected runner plus timeout for the SSH adapter. */
export interface SshAdapterOptions {
  readonly runner: RemoteRunner;
  readonly timeoutMs?: number;
}

export type LogLevel = "info" | "warn" | "error";
