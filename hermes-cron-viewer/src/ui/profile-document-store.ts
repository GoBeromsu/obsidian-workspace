import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { ProfileRef } from "../types/hermes-cron";
import {
  DOCUMENT_RESPONSE_MAX_BYTES,
  DOCUMENT_TIMEOUT_MS,
  type DocumentResult,
  type DocumentRunner,
  type DocumentSnapshot,
  type ProfileDocumentName,
} from "../types/profile-document";
import { REMOTE_DOCUMENT_COMMAND, buildDocumentRequest } from "../domain/profile-document-script";
import { parseDocumentResponse } from "../domain/profile-document-response";

/**
 * ssh options fixed on the command line for the document channel.
 *
 * `-n` is deliberately absent (unlike the read-only adapter) because the request travels on stdin.
 * `RemoteCommand=none` neutralises a host block that would otherwise replace our command.
 * `ProxyJump`/`ProxyCommand` are still the user's own configuration: a documented trust boundary.
 */
const FIXED_OPTIONS: readonly string[] = [
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=yes",
  "-o", "ConnectTimeout=15",
  "-o", "ClearAllForwardings=yes",
  "-o", "PermitLocalCommand=no",
  "-o", "RequestTTY=no",
  "-o", "RemoteCommand=none",
  "-T",
];

/** Default runner: argv only (no local shell), request written to stdin, bounded and timed out. */
export const documentProcessRunner: DocumentRunner = (file, args, stdin, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { stdio: ["pipe", "pipe", "pipe"] });
    // Decode across chunk boundaries: a multi-byte character may be split between two reads.
    const outDecoder = new StringDecoder("utf8");
    const errDecoder = new StringDecoder("utf8");
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let settled = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => {
        child.kill("SIGKILL");
        reject(new Error(`document command timed out after ${options.timeoutMs}ms`));
      });
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > options.maxBytes) {
        finish(() => {
          child.kill("SIGKILL");
          reject(new Error("remote answer exceeded the response bound"));
        });
        return;
      }
      stdout += outDecoder.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 8192) stderr += errDecoder.write(chunk);
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (exitCode) =>
      finish(() => resolve({ stdout: stdout + outDecoder.end(), stderr: stderr + errDecoder.end(), exitCode })),
    );

    child.stdin.on("error", () => {
      /* the child may exit before the request is drained; the close handler reports the truth */
    });
    child.stdin.end(stdin);
  });

/**
 * The only writable remote surface in this plugin.
 *
 * Strictly bounded: the operation is read or save, and the target is always one of two allowlisted
 * names resolved to its fixed Hermes location under the caller-supplied profile home (`SOUL.md` at
 * the home, `USER.md` at `memories/USER.md`). No caller supplies a path; the home must pass the
 * path contract locally and again remotely (clean absolute path, real non-symlink directory). A
 * caller that passes a different home therefore edits those two documents in that home - no other
 * file name is reachable, and nothing here can read the cron store or the ledger.
 * It shares no code path with `SshReadOnlyAdapter`. Bodies live in memory only: nothing is cached,
 * snapshotted or logged.
 */
export class ProfileDocumentStore {
  constructor(
    private readonly runner: DocumentRunner = documentProcessRunner,
    private readonly timeoutMs: number = DOCUMENT_TIMEOUT_MS,
    /** Local override used by tests to run the helper without ssh. */
    private readonly invoke?: (stdin: string) => Promise<{ stdout: string; stderr: string; exitCode: number | null }>,
  ) {}

  /** Exact ssh argv for a document call. Exposed so callers can audit what would run. */
  buildArgv(alias: string): readonly string[] {
    return [...FIXED_OPTIONS, "--", alias, REMOTE_DOCUMENT_COMMAND];
  }

  async read(profile: ProfileRef, name: ProfileDocumentName): Promise<DocumentResult<DocumentSnapshot>> {
    const request = buildDocumentRequest(profile.alias, profile.home, name);
    if (!request.ok) return request;
    return this.exchange(profile.alias, JSON.stringify(request.value));
  }

  /**
   * Save `body` only when the server copy still matches `baseVersion` (`null` meaning "absent")
   * *and* the name still resolves to `expectedPath` - the file the edit was actually read from.
   * A directory link retargeted since the read is refused as a conflict even when the contents are
   * identical or both copies are absent.
   *
   * The remote side re-checks the resolved directory and re-reads the leaf immediately before an
   * atomic same-directory replace and preserves the original permission bits. That narrows the
   * race with an uncooperative external writer; it is not a transaction against all writers, and
   * this build does not claim to be one.
   */
  async save(
    profile: ProfileRef,
    name: ProfileDocumentName,
    body: string,
    baseVersion: string | null,
    expectedPath: string,
  ): Promise<DocumentResult<DocumentSnapshot>> {
    const request = buildDocumentRequest(profile.alias, profile.home, name, { body, baseVersion, expectedPath });
    if (!request.ok) return request;
    return this.exchange(profile.alias, JSON.stringify(request.value));
  }

  private async exchange(alias: string, stdin: string): Promise<DocumentResult<DocumentSnapshot>> {
    let raw: { stdout: string; stderr: string; exitCode: number | null };
    try {
      raw = this.invoke
        ? await this.invoke(stdin)
        : await this.runner("ssh", this.buildArgv(alias), stdin, {
            timeoutMs: this.timeoutMs,
            maxBytes: DOCUMENT_RESPONSE_MAX_BYTES,
          });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, code: "transport-failed", detail };
    }

    const stderr = raw.stderr.toLowerCase();
    if (raw.exitCode === 127 || stderr.includes("command not found") || stderr.includes("python3: not found")) {
      return {
        ok: false,
        code: "python-missing",
        detail: "the server has no usable python3; nothing is installed to work around this",
      };
    }
    // A non-zero exit means the invocation failed; any JSON on stdout is then not a trustworthy
    // answer and is never accepted as success.
    if (raw.exitCode !== 0) {
      return {
        ok: false,
        code: "transport-failed",
        detail: raw.stderr.trim() === "" ? `command failed (exit ${raw.exitCode})` : raw.stderr.trim(),
      };
    }
    const parsed = parseDocumentResponse(raw.stdout);
    if (!parsed.ok) return parsed;
    const response = parsed.value;
    if (!response.ok) return { ok: false, code: response.code, detail: response.detail };
    return {
      ok: true,
      value: {
        body: response.status === "present" ? (response.body ?? "") : "",
        version: response.version,
        mode: response.mode,
        resolvedPath: response.path,
      },
    };
  }
}
