/** Closed set of the eight bound remote read operations (plan section 4, R0-R7). */
export type RemoteOpKind =
  | "shellCanary"
  | "resolveHome"
  | "listProfileDirs"
  | "listCronDirEntries"
  | "readJobsJson"
  | "listOutputFiles"
  | "readOutputFile"
  | "queryExecutions";

/** A fully assembled remote command. `remoteCommand` is executed by the remote login shell. */
export interface BoundRemoteCommand {
  readonly kind: RemoteOpKind;
  /** POSIX single-quoted command string. Never contains user free text. */
  readonly remoteCommand: string;
  /** Application-side prefix bound N. N+1 bytes are requested or streamed to detect overflow. */
  readonly byteCap: number;
  /** True when the response is a NUL-separated enumeration. */
  readonly nulSeparated: boolean;
}

/** Why a command was refused. A refused command is never assembled. */
export type RejectionCode =
  | "invalid-alias"
  | "invalid-profile-id"
  | "invalid-job-id"
  | "invalid-file-name"
  | "not-absolute"
  | "path-escape"
  | "control-character"
  | "option-injection"
  | "invalid-limit";

export type CommandBuildResult =
  | { readonly ok: true; readonly command: BoundRemoteCommand }
  | { readonly ok: false; readonly code: RejectionCode; readonly detail: string };

/** SSH transport vocabulary. This is never the remote Hermes process state. */
export type TransportStatus =
  | "connected"
  | "disconnected"
  | "auth-failed"
  | "host-key-unknown"
  | "timeout"
  | "config-conflict-remote-command"
  | "config-incompatible-shell"
  | "command-missing"
  | "proxy-failed";

/** Native data source vocabulary, independent of transport. */
export type SourceStatus =
  | "read"
  | "file-missing"
  | "parse-failed"
  | "cap-exceeded"
  | "schema-mismatch"
  | "ledger-unavailable"
  | "ledger-missing";

/** Raw result of one remote invocation, before any domain parsing. */
export interface RemoteExecOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  /** True when the application-side prefix bound was reached (received N+1 bytes). */
  readonly capExceeded: boolean;
  readonly transport: TransportStatus;
}

/** Injected process runner. Keeps the adapter testable without a real SSH connection. */
export interface RemoteRunner {
  (
    file: string,
    args: readonly string[],
    options: { readonly timeoutMs: number; readonly maxBytes: number },
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null; capExceeded: boolean }>;
}

/** Byte caps from plan section 4.5. */
export const BYTE_CAPS = {
  jobsJson: 2 * 1024 * 1024,
  outputFile: 1024 * 1024,
  enumeration: 256 * 1024,
  sqlResult: 512 * 1024,
  canary: 4 * 1024,
} as const;

export const COMMAND_TIMEOUT_MS = 30_000;
