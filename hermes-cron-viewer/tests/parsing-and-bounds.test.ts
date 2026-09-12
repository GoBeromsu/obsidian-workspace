import { describe, expect, test } from "bun:test";
import type { SourceKey } from "../src/types/hermes-cron";
import { parseJobsJson } from "../src/domain/jobs-json-parser";
import {
  acceptStructuredJson,
  applyPrefixBound,
  decodeUtf8Prefix,
  splitNulRecords,
} from "../src/domain/response-bound";
import { localDayKey, resolveInstant } from "../src/domain/instant-timezone-resolver";
import {
  buildProfileCandidates,
  defaultHermesHome,
  profileHome,
  profilesRoot,
} from "../src/domain/profile-candidate-paths";

const SOURCE: SourceKey = { alias: "m1-file", profileId: "default" };

/** Shaped after the observed deployment: root has 29 jobs, `prompt`, `schedule.expr`, offsets. */
const REAL_SHAPE = {
  jobs: [
    {
      id: "job-a",
      name: "daily digest",
      enabled: true,
      state: "active",
      schedule: { kind: "cron", expr: "0 9 * * *", display: "every day at 09:00" },
      schedule_display: "every day at 09:00",
      next_run_at: "2026-09-13T09:00:00+09:00",
      last_run_at: "2026-09-12T09:00:00+09:00",
      last_status: "ok",
      prompt: "Summarize yesterday",
      latest_execution: { id: "exec-1", status: "completed" },
      reasoning_effort: "high",
      model_snapshot: "x",
    },
    {
      id: "job-b",
      schedule: { kind: "once", run_at: "2026-09-12T22:00:00+09:00" },
      last_status: "error",
      last_error: "boom",
      failure_streak: 2,
    },
  ],
  updated_at: "2026-09-12T09:00:00+09:00",
};

describe("jobs.json parser", () => {
  test("parses the deployed shape and keeps bodies in the record", () => {
    const { jobs } = parseJobsJson(SOURCE, REAL_SHAPE);
    expect(jobs).toHaveLength(2);
    const [first, second] = jobs;
    expect(first?.id).toBe("job-a");
    expect(first?.schedule.kind).toBe("cron");
    expect(first?.schedule.display).toBe("every day at 09:00");
    expect(first?.nextRunAt).toBe("2026-09-13T09:00:00+09:00");
    expect(first?.prompt).toBe("Summarize yesterday");
    expect(first?.latestExecutionId).toBe("exec-1");
    expect(second?.lastStatus).toBe("error");
    expect(second?.lastError).toBe("boom");
    expect(second?.schedule.raw).toBe("2026-09-12T22:00:00+09:00");
  });

  test("recognized native keys are not a schema mismatch; novel keys are", () => {
    // `reasoning_effort` and `model_snapshot` exist on the deployed records but are not rendered.
    // Reporting them would make every healthy source look mismatched.
    const healthy = parseJobsJson(SOURCE, REAL_SHAPE);
    expect(healthy.unparsedFields).toEqual([]);

    const novel = parseJobsJson(SOURCE, {
      jobs: [{ id: "x", reasoning_effort: "high", brand_new_key: 1, another_new_key: 2 }],
    });
    expect(novel.unparsedFields).toEqual(["another_new_key", "brand_new_key"]);
    expect(novel.unparsedFields).not.toContain("prompt");
  });

  test("reads the native dispatch stamp verbatim", () => {
    const { jobs } = parseJobsJson(SOURCE, {
      jobs: [{
        id: "x",
        last_dispatch: {
          kind: "catch_up",
          scheduled_at: "2026-09-12T09:00:00+09:00",
          dispatched_at: "2026-09-12T09:31:00+09:00",
          lateness_seconds: 1860,
        },
      }],
    });
    expect(jobs[0]?.lastDispatch).toEqual({
      kind: "catch_up",
      scheduledAt: "2026-09-12T09:00:00+09:00",
      dispatchedAt: "2026-09-12T09:31:00+09:00",
      latenessSeconds: 1860,
    });
    expect(parseJobsJson(SOURCE, { jobs: [{ id: "y" }] }).jobs[0]?.lastDispatch).toBeNull();
  });

  test("tolerates missing fields, unknown status values and odd containers", () => {
    const { jobs } = parseJobsJson(SOURCE, { jobs: { a: { id: "only-id" } } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.lastStatus).toBe("absent");
    expect(jobs[0]?.schedule.kind).toBe("unknown");

    const weird = parseJobsJson(SOURCE, { jobs: [{ id: "x", last_status: "teleported" }] });
    expect(weird.jobs[0]?.lastStatus).toBe("unknown-value");
    expect(weird.jobs[0]?.lastStatusRaw).toBe("teleported");

    expect(parseJobsJson(SOURCE, {}).jobs).toHaveLength(0);
    expect(parseJobsJson(SOURCE, null).jobs).toHaveLength(0);
    expect(parseJobsJson(SOURCE, { jobs: [{ name: "no id" }] }).jobs).toHaveLength(0);
  });

  test("treats a present-but-null delivery flag as not unverified", () => {
    const { jobs } = parseJobsJson(SOURCE, {
      jobs: [{ id: "x", last_delivery_unverified: null }, { id: "y", last_delivery_unverified: ["slack"] }],
    });
    expect(jobs[0]?.lastDeliveryUnverified).toBe(false);
    expect(jobs[1]?.lastDeliveryUnverified).toBe(true);
  });
});

describe("response bounds", () => {
  const encode = (text: string) => new TextEncoder().encode(text);

  test("detects N+1 exactly", () => {
    const cap = 8;
    expect(applyPrefixBound(encode("1234567"), cap).capExceeded).toBe(false);
    expect(applyPrefixBound(encode("12345678"), cap).capExceeded).toBe(false);
    const over = applyPrefixBound(encode("123456789"), cap);
    expect(over.capExceeded).toBe(true);
    expect(over.bytes.byteLength).toBe(cap + 1);
  });

  test("retreats to the last complete code point", () => {
    const bytes = encode("한글");
    for (let cut = 1; cut < bytes.byteLength; cut += 1) {
      const decoded = decodeUtf8Prefix(bytes.subarray(0, cut));
      expect(decoded.includes("\uFFFD")).toBe(false);
    }
    expect(decodeUtf8Prefix(bytes)).toBe("한글");
    expect(decodeUtf8Prefix(bytes.subarray(0, 3))).toBe("한");
  });

  test("refuses truncated structured payloads and reports cap first", () => {
    const truncated = acceptStructuredJson<unknown>('{"jobs":[]}', true);
    expect(truncated.ok).toBe(false);
    if (!truncated.ok) expect(truncated.reason).toBe("cap-exceeded");

    const broken = acceptStructuredJson<unknown>('{"jobs":[', false);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.reason).toBe("parse-failed");

    const good = acceptStructuredJson<{ jobs: unknown[] }>('{"jobs":[]}', false);
    expect(good.ok).toBe(true);
  });

  test("drops the final NUL record when the bound was reached", () => {
    expect(splitNulRecords("a\u0000b\u0000c\u0000", false)).toEqual(["a", "b", "c"]);
    expect(splitNulRecords("a\u0000b\u0000trunc", true)).toEqual(["a", "b"]);
    expect(splitNulRecords("", true)).toEqual([]);
  });
});

describe("instant resolution", () => {
  test("places only offset-bearing values", () => {
    const withOffset = resolveInstant("2026-09-12T09:00:00+09:00");
    expect(withOffset?.kind).toBe("absolute");

    expect(resolveInstant("2026-09-12T09:00:00Z")?.kind).toBe("absolute");
    expect(resolveInstant("2026-09-12T09:00:00")?.kind).toBe("timezone-unknown");
    expect(resolveInstant("2026-09-12 09:00:00")?.kind).toBe("timezone-unknown");
    expect(resolveInstant("soon")?.kind).toBe("unparsed");
    expect(resolveInstant(null)).toBeNull();
    expect(resolveInstant("  ")).toBeNull();
  });

  test("day key is derived in local time", () => {
    const instant = resolveInstant("2026-09-12T23:30:00+09:00");
    expect(instant?.kind).toBe("absolute");
    if (instant?.kind === "absolute") {
      const expected = new Date(instant.epochMs);
      expect(localDayKey(instant.epochMs)).toBe(
        `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(expected.getDate()).padStart(2, "0")}`,
      );
    }
  });
});

describe("profile candidates", () => {
  test("default is a native profile name whose home is the root", () => {
    const home = "/Users/beomsu";
    const { profiles, rejectedCount } = buildProfileCandidates(SOURCE.alias, home, [
      `${profilesRoot(home)}/default`,
      `${profilesRoot(home)}/xia`,
      `${profilesRoot(home)}/ossplatform`,
      `${profilesRoot(home)}/_archived-osscompute-20260723T133929`,
      `${profilesRoot(home)}/.deleted`,
      "/etc/passwd",
    ]);

    expect(profiles[0]).toEqual({
      alias: "m1-file",
      profileId: "default",
      home: defaultHermesHome(home),
    });
    const ids = profiles.map((profile) => profile.profileId);
    // Native `_iter_named_profile_dirs` excludes a `profiles/default` directory, so it must not
    // appear twice; `default` resolves to the root home via `get_profile_dir`.
    expect(ids).toEqual(["default", "xia", "ossplatform"]);
    expect(profileHome(home, "default")).toBe(defaultHermesHome(home));
    expect(profileHome(home, "xia")).toBe(`${profilesRoot(home)}/xia`);
    // `_archived-...` and `.deleted` fail the native id contract; `/etc/passwd` is off-root.
    expect(rejectedCount).toBe(3);
  });
});
