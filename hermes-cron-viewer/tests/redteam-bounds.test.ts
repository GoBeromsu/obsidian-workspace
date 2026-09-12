import { describe, expect, test } from "bun:test";
import {
  acceptStructuredJson,
  applyPrefixBound,
  decodeUtf8Prefix,
  splitNulRecords,
} from "../src/domain/response-bound";
import { parseJobsJson } from "../src/domain/jobs-json-parser";
import type { SourceKey } from "../src/types/hermes-cron";

const SOURCE: SourceKey = { alias: "m1-file", profileId: "default" };
const encode = (text: string) => new TextEncoder().encode(text);

describe("response bounds: N-1 / N / N+1", () => {
  test("N-1 and N are complete; N+1 is exactly the overflow signal", () => {
    const cap = 16;
    const nMinus = encode("a".repeat(cap - 1));
    const nExact = encode("a".repeat(cap));
    const nPlus = encode("a".repeat(cap + 1));
    expect(applyPrefixBound(nMinus, cap)).toEqual({ bytes: nMinus, capExceeded: false });
    expect(applyPrefixBound(nExact, cap)).toEqual({ bytes: nExact, capExceeded: false });
    const over = applyPrefixBound(nPlus, cap);
    expect(over.capExceeded).toBe(true);
    expect(over.bytes.byteLength).toBe(cap + 1);
  });

  test("a UTF-8 multibyte sequence cut mid-character never introduces U+FFFD", () => {
    const bytes = encode("한α🎉");
    expect(bytes.byteLength).toBeGreaterThan(3);
    for (let cut = 1; cut < bytes.byteLength; cut += 1) {
      const decoded = decodeUtf8Prefix(bytes.subarray(0, cut));
      expect(decoded.includes("\uFFFD")).toBe(false);
    }
  });

  test("a truncated JSON document that still parses is refused; cap-exceeded wins", () => {
    const stillParses = '{"jobs":[]}';
    expect(() => JSON.parse(stillParses)).not.toThrow();
    const truncated = acceptStructuredJson<unknown>(stillParses, true);
    expect(truncated.ok).toBe(false);
    if (!truncated.ok) expect(truncated.reason).toBe("cap-exceeded");

    const prefix = "[]";
    const larger = "[] , trailing-bytes-after-valid-json";
    expect(larger.startsWith(prefix)).toBe(true);
    expect(() => JSON.parse(prefix)).not.toThrow();
    const refused = acceptStructuredJson<unknown>(prefix, true);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe("cap-exceeded");

    const broken = acceptStructuredJson<unknown>('{"jobs":[', false);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.reason).toBe("parse-failed");
  });

  test("a NUL enumeration whose last record is cut drops that record", () => {
    expect(splitNulRecords("a\u0000b\u0000c\u0000", false)).toEqual(["a", "b", "c"]);
    expect(splitNulRecords("a\u0000b\u0000trunc", true)).toEqual(["a", "b"]);
    expect(splitNulRecords("only-cut", true)).toEqual([]);
    expect(splitNulRecords("\u0000", true)).toEqual([]);
  });

  test("jobs.json that is complete JSON of the wrong shape is a mismatch, not a silent empty view", () => {
    const emptyObject = parseJobsJson(SOURCE, {});
    expect(emptyObject.jobs).toHaveLength(0);
    expect(emptyObject.recognized).toBe(false);

    const notJobs = parseJobsJson(SOURCE, { cron: [] });
    expect(notJobs.recognized).toBe(false);
  });
});
