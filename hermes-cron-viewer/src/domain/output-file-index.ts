import type { OutputFileIndex, SourceKey } from "../types/hermes-cron";
import { checkOutputFileName } from "./remote-token-validator";

/**
 * Turn a NUL-enumerated output listing into separate evidence.
 *
 * The native execution ledger has no column pointing at an output file, so this index is presented
 * beside the ledger rather than merged with it. Names that fail the file-name contract are counted
 * but never reused as a path token.
 */
export function buildOutputFileIndex(
  source: SourceKey,
  jobId: string,
  directory: string,
  entries: readonly string[],
): OutputFileIndex {
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  const files: OutputFileIndex["files"][number][] = [];
  let rejectedCount = 0;

  for (const entry of entries) {
    if (!entry.startsWith(prefix)) {
      rejectedCount += 1;
      continue;
    }
    const fileName = entry.slice(prefix.length);
    if (fileName.includes("/") || !checkOutputFileName(fileName).ok) {
      rejectedCount += 1;
      continue;
    }
    files.push({ source, jobId, fileName });
  }

  // Newest first by name. Native writes a timestamp-shaped name, so this is a display order only
  // and is never interpreted as an association with a ledger row.
  files.sort((a, b) => (a.fileName < b.fileName ? 1 : a.fileName > b.fileName ? -1 : 0));
  return { files, rejectedCount };
}
