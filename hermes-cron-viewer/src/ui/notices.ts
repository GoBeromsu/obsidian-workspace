import { Notice } from "obsidian";
import type { SourceStatus, TransportStatus } from "../types/remote-command";

/** Catalog of every user-facing message, so wording stays consistent and reviewable. */
export const NOTICES = {
  noServers: "No SSH host alias registered yet. Add one in the plugin settings.",
  noSelection: "No Hermes profile selected. Choose one in the plugin settings.",
  discoveryStarted: (alias: string) => `Discovering Hermes profiles on ${alias}...`,
  discoveryFailed: (alias: string, reason: string) => `Could not discover profiles on ${alias}: ${reason}`,
  refreshing: "Refreshing Hermes cron sources...",
  refreshFailed: (reason: string) => `Refresh failed: ${reason}`,
  cacheCleared: "Cached schedule metadata cleared.",
  bodyUnavailable: "Output body is not held in memory. Refresh to fetch it again.",
} as const;

export function notify(message: string, timeoutMs = 4000): void {
  new Notice(message, timeoutMs);
}

/** Human label for the SSH transport axis. This is never the remote Hermes process state. */
export const TRANSPORT_LABEL: Record<TransportStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  "auth-failed": "Authentication failed",
  "host-key-unknown": "Host key not verified",
  timeout: "Timed out",
  "config-conflict-remote-command": "SSH config conflict (RemoteCommand)",
  "config-incompatible-shell": "Incompatible remote shell",
  "command-missing": "Remote command not found",
  "proxy-failed": "Proxy connection failed",
};

/** Human label for the native data-source axis. */
export const SOURCE_LABEL: Record<SourceStatus, string> = {
  read: "Read",
  "file-missing": "No cron data",
  "parse-failed": "Could not parse",
  "cap-exceeded": "Response too large",
  "schema-mismatch": "Unrecognized fields",
  "ledger-unavailable": "History unavailable",
  "ledger-missing": "No history store",
};
