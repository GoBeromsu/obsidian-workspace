import { describe, expect, test } from "bun:test";
import {
  buildListProfileDirs,
} from "../src/domain/discovery-command-builder";
import {
  buildListCronDirEntries,
  buildListOutputFiles,
  buildReadJobsJson,
  buildReadOutputFile,
} from "../src/domain/read-command-builder";
import { buildQueryExecutions } from "../src/domain/sqlite-select-builder";
import { checkJobId, checkOutputFileName, checkProfileId } from "../src/domain/remote-token-validator";
import type { CommandBuildResult } from "../src/types/remote-command";

const SAFE_HOME = "/Users/beomsu/.hermes";
const SAFE_JOB = "job-1";
const SAFE_FILE = "2026-09-12T09:00:00.md";

/** Tokens the assignment requires the builders to refuse rather than emit. */
const INJECTION = [
  { name: "quote", value: "x'y" },
  { name: "dollar-paren", value: "x$(id)y" },
  { name: "backtick", value: "x`id`y" },
  { name: "semicolon", value: "x;id" },
  { name: "pipe", value: "x|id" },
  { name: "newline", value: "x\ny" },
  { name: "nul", value: "x\u0000y" },
  { name: "dotdot", value: "../etc" },
  { name: "leading-dash", value: "-oProxyCommand=curl" },
] as const;

function emitted(result: CommandBuildResult): string | null {
  return result.ok ? result.command.remoteCommand : null;
}

describe("adversarial remote tokens must not assemble a command", () => {
  test("profile ids never match the native contract, so they cannot enter a path", () => {
    for (const token of INJECTION) {
      expect(checkProfileId(token.value).ok).toBe(false);
    }
    expect(checkProfileId("xia").ok).toBe(true);
  });

  test("job ids with injection bytes are refused by every builder that takes a job id", () => {
    for (const token of INJECTION) {
      expect(checkJobId(token.value).ok).toBe(false);
      expect(buildListOutputFiles(SAFE_HOME, token.value).ok).toBe(false);
      expect(buildReadOutputFile(SAFE_HOME, token.value, SAFE_FILE).ok).toBe(false);
      expect(buildQueryExecutions(SAFE_HOME, { jobId: token.value, limit: 5 }).ok).toBe(false);
    }
  });

  test("output file names with injection bytes are refused, never interpolated", () => {
    for (const token of INJECTION) {
      expect(checkOutputFileName(token.value).ok).toBe(false);
      expect(buildReadOutputFile(SAFE_HOME, SAFE_JOB, token.value).ok).toBe(false);
      expect(buildReadOutputFile(SAFE_HOME, SAFE_JOB, `${token.value}.md`).ok).toBe(false);
    }
  });

  test("home paths with newline, NUL, .. or a leading dash refuse rather than emit", () => {
    const mustRefuse = [
      "/Users/x/.hermes\n",
      "/Users/x/.hermes\u0000x",
      "/Users/x/../.hermes",
      "-Users/x/.hermes",
      "/Users/x/./.hermes",
    ];
    for (const home of mustRefuse) {
      expect(emitted(buildListCronDirEntries(home))).toBeNull();
      expect(emitted(buildReadJobsJson(home))).toBeNull();
      expect(emitted(buildListOutputFiles(home, SAFE_JOB))).toBeNull();
      expect(emitted(buildReadOutputFile(home, SAFE_JOB, SAFE_FILE))).toBeNull();
      expect(emitted(buildQueryExecutions(home, { limit: 5 }))).toBeNull();
      expect(emitted(buildListProfileDirs(home))).toBeNull();
    }
  });

  test("a keyset cursor that is not quotable refuses instead of throwing", () => {
    let threw = false;
    let result: CommandBuildResult | undefined;
    try {
      result = buildQueryExecutions(SAFE_HOME, {
        limit: 5,
        before: { claimedAt: "2026-09-12T09:00:00+09:00\n", id: "abc123" },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result?.ok).toBe(false);
  });
});
