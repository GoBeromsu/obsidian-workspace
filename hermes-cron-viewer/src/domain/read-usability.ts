import type { SourceSnapshot } from "../types/snapshot";

/**
 * Did this round produce content worth replacing the previous snapshot with?
 *
 * Being connected is not enough: a connected round can still come back with a missing file, an
 * unparsable document, a bound overflow or an unrecognizable shape, all of which carry zero jobs.
 * Treating those as success would let a transient failure erase the last good schedule and be
 * recorded as fresh.
 */
export function isUsableRead(snapshot: SourceSnapshot): boolean {
  if (snapshot.transport !== "connected") return false;
  if (snapshot.sourceStatus === "read") return true;
  // A partially understood document is usable only when jobs actually came through.
  return snapshot.sourceStatus === "schema-mismatch" && snapshot.jobs.length > 0;
}
