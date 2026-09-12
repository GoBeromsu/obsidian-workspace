/**
 * Types for the one narrowly scoped *writable* remote surface of this plugin.
 *
 * Only `SOUL.md` (at the profile home) and `USER.md` (inside the home's `memories` directory) are
 * reachable, at exactly the locations Hermes itself uses. Nothing here touches the read-only cron
 * surface (R0-R7) or its adapter; that path stays read-only.
 */

/** The wording of one confirmation shown before unsaved work can be lost. */
export interface ConfirmationSpec {
  readonly title: string;
  readonly question: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

/** The closed allowlist of editable document names. Never a path: the mapping below is fixed. */
export const EDITABLE_DOCUMENT_NAMES = ["SOUL.md", "USER.md"] as const;

export type ProfileDocumentName = (typeof EDITABLE_DOCUMENT_NAMES)[number];

/**
 * Where each editable name actually lives, relative to the profile home.
 *
 * Mirrors Hermes: `SOUL.md` sits at the home, while the user memory file is
 * `memories/USER.md` (`get_memory_dir()` = `get_hermes_home()/memories`). `memories` is commonly
 * a symlink into a local store, which the remote helper resolves deliberately.
 */
export const DOCUMENT_RELATIVE_PATHS: Readonly<Record<ProfileDocumentName, string>> = {
  "SOUL.md": "SOUL.md",
  "USER.md": "memories/USER.md",
};

/** Bound on a resolved absolute path reported by the helper. */
export const DOCUMENT_PATH_MAX_LENGTH = 4096;

/** Hard bound on a document body, applied remotely (refusal) and locally (refusal). */
export const DOCUMENT_MAX_BYTES = 256 * 1024;

/**
 * Bound on the remote answer.
 *
 * The helper replies with `json.dumps`, whose default `ensure_ascii=True` escaping expands one
 * source character to at most six output bytes (`\uXXXX`), so a body at the byte bound can legally
 * produce roughly six times its size. Bounding the response at the body bound would reject valid
 * documents, so the worst case plus room for the metadata fields is allowed.
 */
export const DOCUMENT_RESPONSE_MAX_BYTES = 6 * DOCUMENT_MAX_BYTES + 8 * 1024;

/** Timeout for one document invocation. */
export const DOCUMENT_TIMEOUT_MS = 30_000;

/** Why a document request was refused before or during execution. */
export type DocumentFailureCode =
  /** Alias, home or document name failed the local contract. */
  | "invalid-request"
  /** ssh itself could not run the command (auth, host key, network, spawn). */
  | "transport-failed"
  /** No usable `python3` on the remote host. Nothing is installed to fix this. */
  | "python-missing"
  /** The remote helper answered with something this build cannot read. */
  | "bad-response"
  /** Profile home or document is a symlink, not a regular file, or does not resolve to one. */
  | "unsafe-path"
  /** Document is larger than `DOCUMENT_MAX_BYTES`. */
  | "too-large"
  /** Document bytes are not valid UTF-8. */
  | "not-utf8"
  /** The document changed on the server since the version being saved against. */
  | "conflict"
  /** Remote I/O error (permission denied, disk, replace failed). */
  | "io-failed";

/**
 * Version of a document as last observed.
 *
 * `null` is the explicit *absent* marker: it means "no such file", which is a savable base state
 * (creation) and is compared just like a hash.
 */
export type DocumentVersion = string | null;

/** A successfully read document, or the explicit absence of one. */
export interface DocumentSnapshot {
  /** Body text. Empty string when `version` is `null` (absent). */
  readonly body: string;
  /** SHA-256 hex of the file bytes, or `null` when the file does not exist. */
  readonly version: DocumentVersion;
  /** POSIX mode bits of the existing file, or `null` when absent. Preserved across a save. */
  readonly mode: number | null;
  /**
   * The absolute file the helper actually resolved, reported for present, absent and saved alike.
   *
   * This is what the UI shows and what a later save must be bound to via `expectedPath`.
   */
  readonly resolvedPath: string;
}

export type DocumentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: DocumentFailureCode; readonly detail: string };

/**
 * Injected process runner for the document store.
 *
 * Separate from `RemoteRunner` on purpose: this one writes a request body to **stdin**, which the
 * read-only runner deliberately does not do (it passes `-n`).
 */
export interface DocumentRunner {
  (
    file: string,
    args: readonly string[],
    stdin: string,
    options: { readonly timeoutMs: number; readonly maxBytes: number },
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }>;
}

/** Request handed to the remote helper over stdin as one JSON object. */
export interface DocumentRequest {
  readonly op: "read" | "save";
  readonly home: string;
  readonly name: ProfileDocumentName;
  readonly maxBytes: number;
  /** Present only for `save`. */
  readonly body?: string;
  /** Present only for `save`: the version the edit started from, `null` meaning "was absent". */
  readonly baseVersion?: DocumentVersion;
  /**
   * Present only for `save`: the resolved absolute file the edit was read from.
   *
   * The helper refuses the save when the name no longer resolves there, even if the contents are
   * identical or both copies are absent.
   */
  readonly expectedPath?: string;
}

/** The remote helper's single-line JSON answer. */
export type DocumentResponse =
  | {
      readonly ok: true;
      readonly status: "present" | "absent" | "saved";
      readonly body?: string;
      readonly version: DocumentVersion;
      readonly mode: number | null;
      /** The absolute path the helper resolved and acted on. */
      readonly path: string;
    }
  | { readonly ok: false; readonly code: DocumentFailureCode; readonly detail: string };
