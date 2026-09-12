import type { BoundedResponse, StructuredAcceptance } from "../types/contracts";

/**
 * Application-side prefix bounds.
 *
 * N+1 is what this process keeps and judges, not a promise about physical transfer. SSH and OS
 * buffers may already hold more bytes, and the remote `find`/`sqlite3` stop time is not
 * guaranteed. What is guaranteed: a termination request, the command timeout, and refusing to
 * accept an over-bound response as complete.
 */

/** Keep at most `cap + 1` bytes; receiving `cap + 1` proves the payload was longer than `cap`. */
export function applyPrefixBound(bytes: Uint8Array, cap: number): BoundedResponse {
  if (bytes.byteLength <= cap) return { bytes, capExceeded: false };
  return { bytes: bytes.subarray(0, cap + 1), capExceeded: true };
}

/** Length of the trailing bytes that form an incomplete UTF-8 sequence. */
function incompleteTailLength(bytes: Uint8Array): number {
  const max = Math.min(4, bytes.byteLength);
  for (let back = 1; back <= max; back += 1) {
    const byte = bytes[bytes.byteLength - back];
    if (byte === undefined) return 0;
    if ((byte & 0b1100_0000) === 0b1000_0000) continue; // continuation byte
    const needed =
      (byte & 0b1000_0000) === 0 ? 1
      : (byte & 0b1110_0000) === 0b1100_0000 ? 2
      : (byte & 0b1111_0000) === 0b1110_0000 ? 3
      : (byte & 0b1111_1000) === 0b1111_0000 ? 4
      : 0;
    if (needed === 0) return 0; // invalid lead byte: leave it to the decoder
    return needed > back ? back : 0;
  }
  return 0;
}

/**
 * Decode a possibly truncated payload, retreating to the last complete code point.
 *
 * Used for verbatim body display only. Structured payloads are rejected instead of trimmed.
 */
export function decodeUtf8Prefix(bytes: Uint8Array): string {
  const drop = incompleteTailLength(bytes);
  const usable = drop > 0 ? bytes.subarray(0, bytes.byteLength - drop) : bytes;
  return new TextDecoder("utf-8").decode(usable);
}

/**
 * Accept JSON only when the payload is complete.
 *
 * A truncated document that happens to parse is still refused: the last good snapshot is kept and
 * `cap-exceeded` is reported ahead of `parse-failed`.
 */
export function acceptStructuredJson<T>(
  text: string,
  capExceeded: boolean,
): StructuredAcceptance<T> {
  if (capExceeded) {
    return { ok: false, reason: "cap-exceeded", detail: "response reached the prefix bound" };
  }
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (error) {
    return { ok: false, reason: "parse-failed", detail: String(error) };
  }
}

/**
 * Split a NUL-separated enumeration.
 *
 * When the prefix bound was reached the final record may be cut, so it is dropped rather than
 * used as a path token.
 */
export function splitNulRecords(text: string, capExceeded: boolean): readonly string[] {
  const parts = text.split("\u0000").filter((part) => part.length > 0);
  if (!capExceeded || parts.length === 0) return parts;
  return parts.slice(0, -1);
}
