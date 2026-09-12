import type { CommandBuildResult } from "../types/remote-command";
import { BYTE_CAPS } from "../types/remote-command";
import { posixSingleQuote } from "./posix-single-quote";
import {
  checkAbsolutePath,
  checkJobId,
  checkOutputFileName,
  checkWithinRoot,
} from "./remote-token-validator";

function cronDir(home: string): string {
  return `${home}/cron`;
}

/** R3 - list `<home>/cron` entries so jobs.json, the ledger and sidecars are visible at once. */
export function buildListCronDirEntries(home: string): CommandBuildResult {
  const check = checkAbsolutePath(home);
  if (!check.ok) return { ok: false, code: check.code, detail: check.detail };
  return {
    ok: true,
    command: {
      kind: "listCronDirEntries",
      remoteCommand: `find ${posixSingleQuote(cronDir(home))} -mindepth 1 -maxdepth 1 -print0`,
      byteCap: BYTE_CAPS.enumeration,
      nulSeparated: true,
    },
  };
}

/**
 * R4 - read `jobs.json`.
 *
 * `head -c <N+1> FILE` needs no pipe, so the no-pipe rule holds. Receiving exactly N+1 bytes means
 * the prefix bound was reached and the payload must not be accepted as a complete document.
 */
export function buildReadJobsJson(home: string): CommandBuildResult {
  const path = `${cronDir(home)}/jobs.json`;
  const check = checkWithinRoot(path, cronDir(home));
  if (!check.ok) return { ok: false, code: check.code, detail: check.detail };
  return {
    ok: true,
    command: {
      kind: "readJobsJson",
      remoteCommand: `head -c ${BYTE_CAPS.jobsJson + 1} ${posixSingleQuote(path)}`,
      byteCap: BYTE_CAPS.jobsJson,
      nulSeparated: false,
    },
  };
}

/** R5 - enumerate output files for one job. On demand only; never part of a polling round. */
export function buildListOutputFiles(home: string, jobId: string): CommandBuildResult {
  const jobCheck = checkJobId(jobId);
  if (!jobCheck.ok) return { ok: false, code: jobCheck.code, detail: jobCheck.detail };
  const dir = `${cronDir(home)}/output/${jobId}`;
  const check = checkWithinRoot(dir, cronDir(home));
  if (!check.ok) return { ok: false, code: check.code, detail: check.detail };
  return {
    ok: true,
    command: {
      kind: "listOutputFiles",
      remoteCommand:
        `find ${posixSingleQuote(dir)} -mindepth 1 -maxdepth 1 -type f -name '*.md' -print0`,
      byteCap: BYTE_CAPS.enumeration,
      nulSeparated: true,
    },
  };
}

/** R6 - read one output file verbatim. On demand only. */
export function buildReadOutputFile(
  home: string,
  jobId: string,
  fileName: string,
): CommandBuildResult {
  const jobCheck = checkJobId(jobId);
  if (!jobCheck.ok) return { ok: false, code: jobCheck.code, detail: jobCheck.detail };
  const nameCheck = checkOutputFileName(fileName);
  if (!nameCheck.ok) return { ok: false, code: nameCheck.code, detail: nameCheck.detail };
  const path = `${cronDir(home)}/output/${jobId}/${fileName}`;
  const check = checkWithinRoot(path, cronDir(home));
  if (!check.ok) return { ok: false, code: check.code, detail: check.detail };
  return {
    ok: true,
    command: {
      kind: "readOutputFile",
      remoteCommand: `head -c ${BYTE_CAPS.outputFile + 1} ${posixSingleQuote(path)}`,
      byteCap: BYTE_CAPS.outputFile,
      nulSeparated: false,
    },
  };
}
