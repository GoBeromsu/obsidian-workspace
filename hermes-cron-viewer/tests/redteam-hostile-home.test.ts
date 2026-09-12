import { describe, expect, test } from "bun:test";
import { buildListCronDirEntries, buildReadJobsJson } from "../src/domain/read-command-builder";
import { buildQueryExecutions } from "../src/domain/sqlite-select-builder";
import { posixSingleQuote } from "../src/domain/posix-single-quote";
import type { CommandBuildResult } from "../src/types/remote-command";

/** Hostile homes that must never reintroduce a sqlite URI or split the path into extra argv. */
const HOSTILE_HOMES = [
  "/Users/x/.hermes?immutable=1",
  "/Users/x/.hermes?vfs=unix-none",
  "/Users/x/.hermes?nolock=1",
  "/Users/x/.hermes#frag",
  "/Users/x/.hermes%2e%2e",
  "/Users/x/my home",
  "/Users/x/한글경로",
  "/Users/x/.hermes;id",
  "/Users/x/.hermes$(id)",
  "/Users/x/.hermes`id`",
  "/Users/x/.hermes|id",
  "/Users/x/it's",
] as const;

function commandOf(result: CommandBuildResult): string {
  if (!result.ok) throw new Error(`refused: ${result.code}`);
  return result.command.remoteCommand;
}

/** Walk POSIX single-quoted arguments, treating `'\''` as an embedded quote. */
function quotedArgs(command: string): string[] {
  const args: string[] = [];
  let index = 0;
  while (index < command.length) {
    if (command[index] !== "'") {
      index += 1;
      continue;
    }
    let out = "'";
    index += 1;
    while (index < command.length) {
      if (command.startsWith(`'\\''`, index)) {
        out += `'\\''`;
        index += 4;
        continue;
      }
      out += command[index];
      if (command[index] === "'") {
        index += 1;
        break;
      }
      index += 1;
    }
    args.push(out);
  }
  return args;
}

describe("hostile home cannot reintroduce sqlite URI parameters", () => {
  test("emitted sqlite commands stay path arguments, never file: URIs", () => {
    for (const home of HOSTILE_HOMES) {
      const result = buildQueryExecutions(home, { limit: 5 });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const command = result.command.remoteCommand;
      expect(command.startsWith("sqlite3 -readonly -json ")).toBe(true);
      expect(command).not.toContain("file:");
      expect(command).not.toContain("mode=");
      expect(command).not.toContain("?immutable=1'");
      const expectedPath = posixSingleQuote(`${home}/cron/executions.db`);
      expect(command).toContain(expectedPath);
      expect(quotedArgs(command)).toEqual([
        expectedPath,
        quotedArgs(command)[1] ?? "",
      ]);
      expect(quotedArgs(command)).toHaveLength(2);
    }
  });

  test("jobs.json and cron listing keep the whole path as one quoted argument", () => {
    for (const home of HOSTILE_HOMES) {
      const listing = commandOf(buildListCronDirEntries(home));
      const jobs = commandOf(buildReadJobsJson(home));
      const cron = posixSingleQuote(`${home}/cron`);
      const jobsPath = posixSingleQuote(`${home}/cron/jobs.json`);
      expect(listing).toContain(cron);
      expect(jobs).toContain(jobsPath);
      expect(listing.includes(" | ")).toBe(false);
      expect(jobs.includes(" | ")).toBe(false);
      expect(quotedArgs(listing)).toEqual([cron]);
      expect(quotedArgs(jobs)).toEqual([jobsPath]);
    }
  });
});
