import { describe, expect, test } from "bun:test";
import {
  CANARY_LITERAL,
  buildListProfileDirs,
  buildResolveHome,
  buildShellCanary,
} from "../src/domain/discovery-command-builder";
import {
  buildListCronDirEntries,
  buildListOutputFiles,
  buildReadJobsJson,
  buildReadOutputFile,
} from "../src/domain/read-command-builder";
import { buildQueryExecutions } from "../src/domain/sqlite-select-builder";

const HOME = "/Users/beomsu/.hermes";

function commandOf(result: ReturnType<typeof buildReadJobsJson>): string {
  if (!result.ok) throw new Error(`expected a command, got ${result.code}: ${result.detail}`);
  return result.command.remoteCommand;
}

/** Tokens that would mean the closed command set leaked into a general shell. */
const FORBIDDEN = [
  "hermes ", "python", ">", ">>", "|", ";", "&&", "`", "$(", "mkdir", "touch", "rm ", "mv ",
  "chmod", "journal_mode", "VACUUM", ".recover", "immutable", "nolock", "vfs=", "file:",
  "-L ", "-R ", "-D ", "scp", "rsync",
];

describe("bound command builders", () => {
  test("all eight operations avoid forbidden shell and sqlite constructs", () => {
    // The canary deliberately carries `$`, a backtick and a quote *inside* its quoted literal;
    // it is asserted separately below. Every other command must be free of these tokens.
    const commands = [
      commandOf(buildResolveHome()),
      commandOf(buildListProfileDirs(`${HOME}/profiles`)),
      commandOf(buildListCronDirEntries(HOME)),
      commandOf(buildReadJobsJson(HOME)),
      commandOf(buildListOutputFiles(HOME, "job-1")),
      commandOf(buildReadOutputFile(HOME, "job-1", "2026-09-12T09:00:00.md")),
      commandOf(buildQueryExecutions(HOME, { limit: 50 })),
    ];
    expect(commands).toHaveLength(7);
    for (const command of commands) {
      for (const token of FORBIDDEN) {
        expect(command.includes(token)).toBe(false);
      }
    }
  });

  test("the canary keeps its metacharacters inside a single quoted literal", () => {
    const command = commandOf(buildShellCanary());
    // Everything after the format string is one quoted argument, so `$X` and the backtick are
    // literal bytes for the remote shell rather than expansion or command substitution.
    expect(command.startsWith(`printf '%s\\n' '`)).toBe(true);
    expect(command.endsWith("'")).toBe(true);
    expect(command).not.toContain("$(");
  });

  test("canary literal survives quoting", () => {
    const command = commandOf(buildShellCanary());
    expect(CANARY_LITERAL).toContain("'");
    expect(command).toBe(`printf '%s\\n' 'it'\\''s $X \`b\` ok'`);
  });

  test("home resolution expands $HOME on the remote side only", () => {
    expect(commandOf(buildResolveHome())).toBe(`printf '%s\\n' "$HOME"`);
  });

  test("enumerations are NUL separated", () => {
    const listing = buildListOutputFiles(HOME, "job-1");
    expect(listing.ok).toBe(true);
    if (listing.ok) {
      expect(listing.command.nulSeparated).toBe(true);
      expect(listing.command.remoteCommand).toContain("-print0");
    }
  });

  test("single-file reads request cap + 1 bytes without a pipe", () => {
    const jobs = buildReadJobsJson(HOME);
    expect(jobs.ok).toBe(true);
    if (jobs.ok) {
      expect(jobs.command.remoteCommand).toBe(
        `head -c ${jobs.command.byteCap + 1} '${HOME}/cron/jobs.json'`,
      );
    }
  });

  test("refuses to assemble a command for adversarial input", () => {
    expect(buildListOutputFiles(HOME, "../../etc").ok).toBe(false);
    expect(buildReadOutputFile(HOME, "job-1", "../../../etc/passwd").ok).toBe(false);
    expect(buildReadOutputFile(HOME, "job-1", "evil\nname.md").ok).toBe(false);
    expect(buildListCronDirEntries("relative/path").ok).toBe(false);
    expect(buildListProfileDirs("-oProxyCommand=x").ok).toBe(false);
  });
});

describe("sqlite select builder", () => {
  test("passes an absolute path and fixed -json, never a file: URI", () => {
    const command = commandOf(buildQueryExecutions(HOME, { limit: 50 }));
    expect(command).toContain("sqlite3 -readonly -json");
    expect(command).toContain(`'${HOME}/cron/executions.db'`);
    expect(command).not.toContain("?");
  });

  test("keeps native ordering and bounds the limit", () => {
    const command = commandOf(buildQueryExecutions(HOME, { limit: 10 }));
    expect(command).toContain("ORDER BY claimed_at DESC, id DESC LIMIT 10");
    expect(buildQueryExecutions(HOME, { limit: 0 }).ok).toBe(false);
    expect(buildQueryExecutions(HOME, { limit: 500 }).ok).toBe(false);
  });

  test("escapes SQL string literals and refuses invalid job ids", () => {
    const command = commandOf(buildQueryExecutions(HOME, { jobId: "job-1", limit: 5 }));
    // SQL doubles the quote, then POSIX quoting of the whole statement renders it as `'\''`.
    expect(command).toContain(`job_id = '\\''job-1'\\''`);
    expect(buildQueryExecutions(HOME, { jobId: "a'; DROP TABLE executions;--", limit: 5 }).ok)
      .toBe(false);
  });

  test("a hostile home cannot reintroduce URI parameters", () => {
    for (const home of [
      "/Users/x/.hermes?immutable=1",
      "/Users/x/.hermes#frag",
      "/Users/x/.hermes%2e%2e",
      "/Users/x/my home",
      "/Users/x/한글",
    ]) {
      const result = buildQueryExecutions(home, { limit: 5 });
      if (!result.ok) continue;
      const command = result.command.remoteCommand;
      expect(command).toContain("-readonly -json");
      expect(command).not.toContain("file:");
      // The whole path is one quoted argument, so `?`/`#`/`%` stay path bytes.
      expect(command).toContain(`'${home}/cron/executions.db'`);
      expect(command).not.toContain("immutable=1'");
    }
  });

  test("keyset cursor uses row-value comparison", () => {
    const command = commandOf(
      buildQueryExecutions(HOME, {
        limit: 5,
        before: { claimedAt: "2026-09-12T09:00:00+09:00", id: "abc123" },
      }),
    );
    expect(command).toContain(
      `(claimed_at, id) < ('\\''2026-09-12T09:00:00+09:00'\\'', '\\''abc123'\\'')`,
    );
  });
});
