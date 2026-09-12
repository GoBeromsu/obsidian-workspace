import type { RejectionCode } from "../types/remote-command";
import { isQuotable } from "./posix-single-quote";
import type { TokenCheck } from "../types/contracts";

const OK: TokenCheck = { ok: true };

function fail(code: RejectionCode, detail: string): TokenCheck {
  return { ok: false, code, detail };
}

/** SSH host alias as registered by the user. */
const ALIAS_RE = /^[A-Za-z0-9._-]{1,64}$/;
/** Native profile id contract, mirrored from Hermes `_PROFILE_ID_RE`. */
const PROFILE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const JOB_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const OUTPUT_FILE_RE = /^[A-Za-z0-9._:+-]{1,128}\.md$/;

/** A token starting with `-` would be read as an option by ssh, find, head or sqlite3. */
function looksLikeOption(token: string): boolean {
  return token.startsWith("-");
}

export function checkAlias(alias: string): TokenCheck {
  if (looksLikeOption(alias)) return fail("option-injection", "alias starts with '-'");
  if (!ALIAS_RE.test(alias)) return fail("invalid-alias", `alias does not match ${ALIAS_RE.source}`);
  return OK;
}

export function checkProfileId(profileId: string): TokenCheck {
  if (!PROFILE_ID_RE.test(profileId)) {
    return fail("invalid-profile-id", `profile id does not match ${PROFILE_ID_RE.source}`);
  }
  return OK;
}

export function checkJobId(jobId: string): TokenCheck {
  if (looksLikeOption(jobId)) return fail("option-injection", "job id starts with '-'");
  if (!JOB_ID_RE.test(jobId)) return fail("invalid-job-id", `job id does not match ${JOB_ID_RE.source}`);
  return OK;
}

export function checkOutputFileName(fileName: string): TokenCheck {
  if (looksLikeOption(fileName)) return fail("option-injection", "file name starts with '-'");
  if (!OUTPUT_FILE_RE.test(fileName)) {
    return fail("invalid-file-name", `file name does not match ${OUTPUT_FILE_RE.source}`);
  }
  return OK;
}

/**
 * Lexical absolute-path check.
 *
 * This is lexical only: it does not resolve symlinks and cannot prevent a concurrent replacement.
 * The plan states the trusted-directory assumption explicitly rather than claiming race safety.
 */
export function checkAbsolutePath(path: string): TokenCheck {
  if (!isQuotable(path)) return fail("control-character", "path contains a control character");
  if (looksLikeOption(path)) return fail("option-injection", "path starts with '-'");
  if (!path.startsWith("/")) return fail("not-absolute", "path is not absolute");
  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return fail("path-escape", "path contains a '.' or '..' segment");
  }
  if (path.includes("//")) return fail("path-escape", "path contains an empty segment");
  return OK;
}

/** Normalized containment check: `candidate` must sit beneath `root`. */
export function checkWithinRoot(candidate: string, root: string): TokenCheck {
  const candidateCheck = checkAbsolutePath(candidate);
  if (!candidateCheck.ok) return candidateCheck;
  const rootCheck = checkAbsolutePath(root);
  if (!rootCheck.ok) return rootCheck;
  const normalizedRoot = root.endsWith("/") ? root : `${root}/`;
  if (!candidate.startsWith(normalizedRoot)) {
    return fail("path-escape", `path is not beneath ${root}`);
  }
  return OK;
}

export function checkLimit(limit: number, max = 200): TokenCheck {
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    return fail("invalid-limit", `limit must be an integer in 1..${max}`);
  }
  return OK;
}
