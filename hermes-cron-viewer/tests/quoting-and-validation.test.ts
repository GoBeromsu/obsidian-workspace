import { describe, expect, test } from "bun:test";
import {
  UnquotableTokenError,
  isQuotable,
  posixSingleQuote,
} from "../src/domain/posix-single-quote";
import {
  checkAbsolutePath,
  checkAlias,
  checkJobId,
  checkLimit,
  checkOutputFileName,
  checkProfileId,
  checkWithinRoot,
} from "../src/domain/remote-token-validator";

describe("posixSingleQuote", () => {
  test("wraps plain tokens", () => {
    expect(posixSingleQuote("/Users/x/.hermes")).toBe("'/Users/x/.hermes'");
  });

  test("closes and reopens around an embedded quote", () => {
    expect(posixSingleQuote("it's")).toBe(`'it'\\''s'`);
  });

  test("neutralizes shell metacharacters as literal text", () => {
    for (const token of ["$HOME", "`id`", "$(id)", "a b", "a;b", "a|b", "a&&b", "*", "~"]) {
      const quoted = posixSingleQuote(token);
      expect(quoted.startsWith("'")).toBe(true);
      expect(quoted.endsWith("'")).toBe(true);
      // Round-trip: a POSIX shell reading the quoted form yields the original token.
      expect(unquote(quoted)).toBe(token);
    }
  });

  test("round-trips unicode and repeated quotes", () => {
    for (const token of ["한글 경로", "a''b", "'", "''", "리포트 2026.md"]) {
      expect(unquote(posixSingleQuote(token))).toBe(token);
    }
  });

  test("refuses control characters, newline and NUL", () => {
    for (const token of ["a\nb", "a\u0000b", "a\tb", "a\u007fb"]) {
      expect(isQuotable(token)).toBe(false);
      expect(() => posixSingleQuote(token)).toThrow(UnquotableTokenError);
    }
  });
});

/** Minimal POSIX single-quote reader used to prove the round trip. */
function unquote(quoted: string): string {
  let out = "";
  let index = 0;
  while (index < quoted.length) {
    if (quoted[index] === "'") {
      index += 1;
      while (index < quoted.length && quoted[index] !== "'") {
        out += quoted[index];
        index += 1;
      }
      index += 1;
      continue;
    }
    if (quoted[index] === "\\") {
      out += quoted[index + 1] ?? "";
      index += 2;
      continue;
    }
    out += quoted[index];
    index += 1;
  }
  return out;
}

describe("token validation", () => {
  test("accepts the real deployment alias and rejects option injection", () => {
    expect(checkAlias("m1-file").ok).toBe(true);
    const rejected = checkAlias("-oProxyCommand=curl evil");
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe("option-injection");
  });

  test("uses the native profile id contract", () => {
    expect(checkProfileId("xia").ok).toBe(true);
    expect(checkProfileId("ossplatform").ok).toBe(true);
    expect(checkProfileId("_archived-osscompute-20260723T133929").ok).toBe(false);
    expect(checkProfileId("Xia").ok).toBe(false);
    expect(checkProfileId("../etc").ok).toBe(false);
  });

  test("rejects job ids and file names outside the contract", () => {
    expect(checkJobId("job_123-abc").ok).toBe(true);
    expect(checkJobId("job/../../etc").ok).toBe(false);
    expect(checkOutputFileName("2026-09-12T09:00:00.md").ok).toBe(true);
    expect(checkOutputFileName("evil\nname.md").ok).toBe(false);
    expect(checkOutputFileName("notes.txt").ok).toBe(false);
  });

  test("requires absolute normalized paths", () => {
    expect(checkAbsolutePath("/Users/x/.hermes").ok).toBe(true);
    expect(checkAbsolutePath("Users/x").ok).toBe(false);
    expect(checkAbsolutePath("/Users/../etc/passwd").ok).toBe(false);
    expect(checkAbsolutePath("/Users//x").ok).toBe(false);
    expect(checkAbsolutePath("/Users/x\n/y").ok).toBe(false);
  });

  test("enforces containment beneath the cron root", () => {
    expect(checkWithinRoot("/h/.hermes/cron/jobs.json", "/h/.hermes/cron").ok).toBe(true);
    const escaped = checkWithinRoot("/h/.hermes/other/jobs.json", "/h/.hermes/cron");
    expect(escaped.ok).toBe(false);
    if (!escaped.ok) expect(escaped.code).toBe("path-escape");
  });

  test("bounds the history limit", () => {
    expect(checkLimit(50).ok).toBe(true);
    expect(checkLimit(0).ok).toBe(false);
    expect(checkLimit(201).ok).toBe(false);
    expect(checkLimit(1.5).ok).toBe(false);
  });
});
