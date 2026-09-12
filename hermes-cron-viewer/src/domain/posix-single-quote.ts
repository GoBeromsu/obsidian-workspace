/**
 * Quote one token for a remote POSIX login shell.
 *
 * `execFile('ssh', argv)` only bypasses the *local* shell; sshd hands the command string to the
 * remote login shell. Every path, file name and SQL string must pass through here first.
 */

/** Control characters, NUL and newline can never appear in a bound token. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export class UnquotableTokenError extends Error {
  constructor(readonly reason: "control-character") {
    super(`token contains a control character and cannot be quoted`);
    this.name = "UnquotableTokenError";
  }
}

/** True when the token is safe to quote (no control characters, including newline and NUL). */
export function isQuotable(token: string): boolean {
  return !CONTROL_CHARACTERS.test(token);
}

/**
 * Wrap `token` in single quotes, closing and reopening the quote around embedded `'`.
 *
 * `it's` becomes `'it'\''s'`, which a POSIX shell reads back as the literal `it's`.
 */
export function posixSingleQuote(token: string): string {
  if (!isQuotable(token)) {
    throw new UnquotableTokenError("control-character");
  }
  return `'${token.split("'").join(`'\\''`)}'`;
}
