import { posixSingleQuote } from "./posix-single-quote";
import { REMOTE_DOCUMENT_SCRIPT } from "./profile-document-python";
import { checkAbsolutePath, checkAlias } from "./remote-token-validator";
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_PATH_MAX_LENGTH,
  EDITABLE_DOCUMENT_NAMES,
  type DocumentRequest,
  type DocumentResult,
  type ProfileDocumentName,
} from "../types/profile-document";

/**
 * Remote command string: a fixed, fully quoted `python3 -c <loader>`.
 *
 * The program is carried base64-encoded because a bound token may not contain a newline; the
 * loader itself is a constant and no request data appears anywhere on the command line.
 */
export const REMOTE_DOCUMENT_COMMAND = `python3 -c ${posixSingleQuote(
  `import base64;exec(base64.b64decode("${Buffer.from(REMOTE_DOCUMENT_SCRIPT, "utf8").toString("base64")}").decode("utf-8"))`,
)}`;

export function isEditableDocumentName(name: string): name is ProfileDocumentName {
  return (EDITABLE_DOCUMENT_NAMES as readonly string[]).includes(name);
}

/**
 * Shape check for an absolute path the helper reported (or that a save is bound to).
 *
 * A resolved path is never trusted as "whatever the remote said": it must be a bounded, clean,
 * absolute path. It may leave the profile home, because `memories` is legitimately a symlink into
 * a local store, so containment is deliberately not asserted here.
 */
export function isResolvedPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > DOCUMENT_PATH_MAX_LENGTH) return false;
  if (!value.startsWith("/") || value.endsWith("/")) return false;
  if (value.includes("\0") || value.includes("\n")) return false;
  const segments = value.split("/").slice(1);
  return !segments.some((segment) => segment === "" || segment === "." || segment === "..");
}

/** Local mirror of the remote guards, so a bad request never leaves this process. */
export function buildDocumentRequest(
  alias: string,
  home: string,
  name: string,
  save?: {
    readonly body: string;
    readonly baseVersion: string | null;
    /** The resolved file the edit started from; the save is refused if it moved. */
    readonly expectedPath: string;
  },
): DocumentResult<DocumentRequest> {
  const aliasCheck = checkAlias(alias);
  if (!aliasCheck.ok) return { ok: false, code: "invalid-request", detail: aliasCheck.detail };
  const homeCheck = checkAbsolutePath(home);
  if (!homeCheck.ok) return { ok: false, code: "invalid-request", detail: homeCheck.detail };
  if (home.endsWith("/")) {
    return { ok: false, code: "invalid-request", detail: "home must not end with '/'" };
  }
  if (!isEditableDocumentName(name)) {
    return { ok: false, code: "invalid-request", detail: `${name} is not an editable document` };
  }
  if (save === undefined) {
    return { ok: true, value: { op: "read", home, name, maxBytes: DOCUMENT_MAX_BYTES } };
  }
  if (Buffer.byteLength(save.body, "utf8") > DOCUMENT_MAX_BYTES) {
    return { ok: false, code: "too-large", detail: "new body exceeds the 256 KiB bound" };
  }
  if (!isResolvedPath(save.expectedPath)) {
    return { ok: false, code: "invalid-request", detail: "the path the edit was read from is not a usable absolute path" };
  }
  if (!save.expectedPath.endsWith(`/${name}`)) {
    return { ok: false, code: "invalid-request", detail: `the path the edit was read from is not a ${name}` };
  }
  return {
    ok: true,
    value: {
      op: "save",
      home,
      name,
      maxBytes: DOCUMENT_MAX_BYTES,
      body: save.body,
      baseVersion: save.baseVersion,
      expectedPath: save.expectedPath,
    },
  };
}
