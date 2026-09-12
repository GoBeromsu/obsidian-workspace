import { describe, expect, test } from "bun:test";
import { HERMES, PROFILE, SOURCE, SshReadOnlyAdapter, collectSource, fakeRunner, isUsableRead, parseExecutionRows, parseJobsJson, readExecutionHistory } from "./delta-fixtures";

describe("delta: unrecognizable jobs.json is schema-mismatch", () => {
  test("rows present but none parseable are not a silent empty read", async () => {
    const parsed = parseJobsJson(SOURCE, { jobs: [{ name: "no id" }, "x"] });
    expect(parsed.jobs).toHaveLength(0);
    expect(parsed.recognized).toBe(false);

    const { runner } = fakeRunner([
      { match: "-print0", stdout: `${HERMES}/cron/jobs.json\u0000` },
      { match: "cron/jobs.json", stdout: JSON.stringify({ jobs: [{ name: "no id" }] }) },
    ]);
    const collected = await collectSource(new SshReadOnlyAdapter({ runner }), PROFILE);
    expect(collected.snapshot.sourceStatus).toBe("schema-mismatch");
    expect(collected.snapshot.jobs).toHaveLength(0);
    expect(isUsableRead(collected.snapshot)).toBe(false);
  });
});

describe("delta: ledger shape recognition", () => {
  test("a non-array sqlite payload is unavailable, not an empty success", async () => {
    expect(parseExecutionRows(SOURCE, { rows: [] }).recognized).toBe(false);
    expect(parseExecutionRows(SOURCE, [{ name: "no id" }]).recognized).toBe(false);
    expect(parseExecutionRows(SOURCE, []).recognized).toBe(true);

    const { runner } = fakeRunner([{ match: "sqlite3", stdout: JSON.stringify({ not: "rows" }) }]);
    const result = await readExecutionHistory(new SshReadOnlyAdapter({ runner }), PROFILE, { limit: 5 });
    expect(result.status).toBe("ledger-unavailable");
    expect(result.detail).toContain("did not match a known row shape");
    expect(result.rows).toHaveLength(0);
  });
});
