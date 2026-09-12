import type { CommandBuildResult } from "../types/remote-command";
import { BYTE_CAPS } from "../types/remote-command";
import { posixSingleQuote } from "./posix-single-quote";
import { checkAbsolutePath } from "./remote-token-validator";

/** Literal the canary echoes back. Contains a quote, `$`, a backtick and spaces on purpose. */
export const CANARY_LITERAL = `it's $X \`b\` ok`;

/**
 * R0 - prove the remote login shell is POSIX compatible before trusting the quoting contract.
 * Input arity is zero: the literal is fixed, so this adds no injection surface.
 */
export function buildShellCanary(): CommandBuildResult {
  return {
    ok: true,
    command: {
      kind: "shellCanary",
      remoteCommand: `printf '%s\\n' ${posixSingleQuote(CANARY_LITERAL)}`,
      byteCap: BYTE_CAPS.canary,
      nulSeparated: false,
    },
  };
}

/**
 * R1 - resolve the absolute remote home.
 *
 * A single-quoted `~` is not expanded by the shell, so the absolute path must be read first and
 * every later path is assembled from this value.
 */
export function buildResolveHome(): CommandBuildResult {
  return {
    ok: true,
    command: {
      kind: "resolveHome",
      remoteCommand: `printf '%s\\n' "$HOME"`,
      byteCap: BYTE_CAPS.canary,
      nulSeparated: false,
    },
  };
}

/**
 * R2 - enumerate named profile directories under `<hermesRoot>/profiles`.
 *
 * Directory names only: no `jobs.json`, output body or settings content is read before the user
 * selects a profile.
 */
export function buildListProfileDirs(profilesRoot: string): CommandBuildResult {
  const check = checkAbsolutePath(profilesRoot);
  if (!check.ok) return { ok: false, code: check.code, detail: check.detail };
  const quoted = posixSingleQuote(profilesRoot);
  return {
    ok: true,
    command: {
      kind: "listProfileDirs",
      remoteCommand: `find ${quoted} -mindepth 1 -maxdepth 1 -type d -print0`,
      byteCap: BYTE_CAPS.enumeration,
      nulSeparated: true,
    },
  };
}
