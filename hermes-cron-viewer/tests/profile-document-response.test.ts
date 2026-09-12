import { describe, expect, test } from "bun:test";
import { parseDocumentResponse } from "../src/domain/profile-document-response";
import { ProfileDocumentStore } from "../src/ui/profile-document-store";

describe("profile document response parser", () => {
  test("a malformed answer is refused rather than read as an empty document", async () => {
    const digest = "a".repeat(64);
    const path = "/home/x/.hermes/memories/USER.md";
    const rejected = [
      "",
      "not json",
      "[]",
      '"present"',
      '{"status": "present"}',
      `{"ok": true, "status": "weird", "version": null, "mode": null, "path": "${path}"}`,
      `{"ok": true, "status": "present", "version": "short", "mode": 384, "body": "x", "path": "${path}"}`,
      `{"ok": true, "status": "present", "version": "${digest}", "mode": 384, "path": "${path}"}`,
      `{"ok": true, "status": "absent", "version": "${digest}", "mode": null, "path": "${path}"}`,
      `{"ok": true, "status": "absent", "version": null, "mode": 384, "path": "${path}"}`,
      `{"ok": true, "status": "saved", "version": "${digest}", "mode": 384, "body": "leak", "path": "${path}"}`,
      `{"ok": true, "status": "present", "version": "${digest}", "mode": 99999, "body": "x", "path": "${path}"}`,
      // A success without a resolved path is not a usable answer any more.
      `{"ok": true, "status": "present", "version": "${digest}", "mode": 420, "body": "hi"}`,
      `{"ok": true, "status": "absent", "version": null, "mode": null}`,
      // An untrustworthy path is refused rather than shown or saved against.
      `{"ok": true, "status": "absent", "version": null, "mode": null, "path": "memories/USER.md"}`,
      `{"ok": true, "status": "absent", "version": null, "mode": null, "path": "/home/x/../USER.md"}`,
      `{"ok": true, "status": "absent", "version": null, "mode": null, "path": "/home/x/memories/USER.md/"}`,
      `{"ok": true, "status": "absent", "version": null, "mode": null, "path": "/home/x/NOTES.md"}`,
      `{"ok": true, "status": "absent", "version": null, "mode": null, "path": "/${"p".repeat(4100)}/USER.md"}`,
      '{"ok": false, "detail": "nope"}',
      '{"ok": false, "code": "made-up", "detail": "nope"}',
      '{"ok": false, "code": "conflict"}',
    ];
    for (const line of rejected) {
      expect(parseDocumentResponse(line)).toMatchObject({ ok: false, code: "bad-response" });
    }

    const accepted = parseDocumentResponse(
      `{"ok": true, "status": "present", "version": "${digest}", "mode": 420, "body": "hi", "path": "${path}"}`,
    );
    expect(accepted).toEqual({
      ok: true,
      value: { ok: true, status: "present", version: digest, mode: 420, body: "hi", path },
    });
    // `memories` may legitimately point outside the profile home, so containment is not required.
    const outside = "/Users/x/.hermes-local/memories/sari/USER.md";
    expect(
      parseDocumentResponse(`{"ok": true, "status": "absent", "version": null, "mode": null, "path": "${outside}"}`),
    ).toEqual({ ok: true, value: { ok: true, status: "absent", version: null, mode: null, path: outside } });

    expect(parseDocumentResponse('{"ok": false, "code": "conflict", "detail": "changed"}')).toEqual({
      ok: true,
      value: { ok: false, code: "conflict", detail: "changed" },
    });

    // A malformed answer never reaches the caller as a document.
    const store = new ProfileDocumentStore(undefined, 1000, async () => ({
      stdout: '{"ok": true, "status": "present", "version": null, "mode": null, "path": "/home/x/.hermes/SOUL.md"}',
      stderr: "",
      exitCode: 0,
    }));
    const result = await store.read({ alias: "server", profileId: "default", home: "/home/x/.hermes" }, "SOUL.md");
    expect(result).toMatchObject({ ok: false, code: "bad-response" });
  });
});
