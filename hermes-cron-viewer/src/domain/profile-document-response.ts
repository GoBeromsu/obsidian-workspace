import { isResolvedPath } from "./profile-document-script";
import {
  EDITABLE_DOCUMENT_NAMES,
  type DocumentFailureCode,
  type DocumentResponse,
  type DocumentResult,
} from "../types/profile-document";

const FAILURE_CODES: readonly DocumentFailureCode[] = [
  "invalid-request", "transport-failed", "python-missing", "bad-response",
  "unsafe-path", "too-large", "not-utf8", "conflict", "io-failed",
];

function isFailureCode(value: unknown): value is DocumentFailureCode {
  return typeof value === "string" && (FAILURE_CODES as readonly string[]).includes(value);
}

const SHA256_RE = /^[0-9a-f]{64}$/;

function badResponse(detail: string): DocumentResult<DocumentResponse> {
  return { ok: false, code: "bad-response", detail };
}

/**
 * Parse and fully validate the helper's single-line answer.
 *
 * Every field the caller later reads is checked here, so a truncated, corrupted or hostile line
 * cannot become an empty body, a fabricated version or an unknown failure code.
 */
export function parseDocumentResponse(stdout: string): DocumentResult<DocumentResponse> {
  const line = stdout.trim();
  if (line === "") return badResponse("remote helper said nothing");
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return badResponse("remote answer was not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return badResponse("remote answer was not a JSON object");
  }
  const raw = parsed as Record<string, unknown>;
  if (typeof raw.ok !== "boolean") return badResponse("remote answer has no ok flag");

  if (raw.ok === false) {
    if (!isFailureCode(raw.code)) return badResponse("remote failure code is not recognised");
    if (typeof raw.detail !== "string") return badResponse("remote failure has no detail");
    return { ok: true, value: { ok: false, code: raw.code, detail: raw.detail } };
  }

  const status = raw.status;
  if (status !== "present" && status !== "absent" && status !== "saved") {
    return badResponse("remote status is not recognised");
  }
  const version = raw.version;
  if (status === "absent") {
    if (version !== null) return badResponse("an absent document cannot carry a version");
  } else if (typeof version !== "string" || !SHA256_RE.test(version)) {
    return badResponse("remote version is not a sha256 digest");
  }
  const mode = raw.mode;
  if (mode !== null && (typeof mode !== "number" || !Number.isInteger(mode) || mode < 0 || mode > 0o7777)) {
    return badResponse("remote mode is not a permission value");
  }
  if (status === "absent" && mode !== null) return badResponse("an absent document cannot carry a mode");
  const path = raw.path;
  if (!isResolvedPath(path)) return badResponse("remote answer carries no usable resolved path");
  if (!EDITABLE_DOCUMENT_NAMES.some((name) => path.endsWith(`/${name}`))) {
    return badResponse("remote resolved path is not an editable document");
  }
  if (status === "present" && typeof raw.body !== "string") {
    return badResponse("remote answer carries no document body");
  }
  if (status !== "present" && raw.body !== undefined) {
    return badResponse("only a present document may carry a body");
  }
  return {
    ok: true,
    value: {
      ok: true,
      status,
      version: version as string | null,
      mode: mode as number | null,
      path,
      ...(status === "present" ? { body: raw.body as string } : {}),
    },
  };
}
