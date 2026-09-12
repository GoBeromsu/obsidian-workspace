import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileRef } from "../src/types/hermes-cron";
import { DOCUMENT_MAX_BYTES } from "../src/types/profile-document";
import { REMOTE_DOCUMENT_SCRIPT } from "../src/domain/profile-document-python";
import { ProfileDocumentStore } from "../src/ui/profile-document-store";

/**
 * The remote helper is run locally, exactly as it would run remotely (`python3 -c <script>` with
 * the request on stdin), against an isolated temp fixture. No real Hermes home is touched.
 */
function localInvoke(stdin: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-c", REMOTE_DOCUMENT_SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
    child.stdin.end(stdin);
  });
}

/**
 * `USER.md` lives in `<home>/memories`, so the fixture creates that directory; `SOUL.md` stays at
 * the home itself. `userPath`/`soulPath` are the paths the helper is expected to resolve.
 */
function fixture(): {
  store: ProfileDocumentStore;
  profile: ProfileRef;
  home: string;
  soulPath: string;
  userPath: string;
} {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "hcv-doc-")));
  mkdirSync(join(home, "memories"));
  return {
    store: new ProfileDocumentStore(undefined, 10_000, localInvoke),
    profile: { alias: "server", profileId: "default", home },
    home,
    soulPath: join(home, "SOUL.md"),
    userPath: join(home, "memories", "USER.md"),
  };
}

const sha256 = (text: string): string =>
  require("node:crypto").createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

describe("profile document store", () => {
  test("absent document reads as absent and is created only by an explicit save", async () => {
    const { store, profile, home, soulPath } = fixture();
    const read = await store.read(profile, "SOUL.md");
    expect(read).toEqual({ ok: true, value: { body: "", version: null, mode: null, resolvedPath: soulPath } });
    expect(readdirSync(home)).toEqual(["memories"]);

    const saved = await store.save(profile, "SOUL.md", "hello soul\n", null, soulPath);
    expect(saved.ok).toBe(true);
    expect(saved.ok && saved.value.resolvedPath).toBe(soulPath);
    expect(readFileSync(soulPath, "utf8")).toBe("hello soul\n");
    if (saved.ok) expect(saved.value.version).toBe(sha256("hello soul\n"));
  });

  test("read/save roundtrip carries body and version", async () => {
    const { store, profile, userPath } = fixture();
    writeFileSync(userPath, "first\n");
    const read = await store.read(profile, "USER.md");
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.body).toBe("first\n");
    expect(read.value.version).toBe(sha256("first\n"));
    expect(read.value.resolvedPath).toBe(userPath);

    const saved = await store.save(profile, "USER.md", "second\n", read.value.version, read.value.resolvedPath);
    expect(saved.ok).toBe(true);
    expect(readFileSync(userPath, "utf8")).toBe("second\n");
    const again = await store.read(profile, "USER.md");
    if (again.ok) expect(again.value.version).toBe(sha256("second\n"));
  });

  test("a stale version is refused as a conflict and leaves the file untouched", async () => {
    const { store, profile, home, soulPath } = fixture();
    writeFileSync(soulPath, "original\n");
    const stale = sha256("something else\n");
    const result = await store.save(profile, "SOUL.md", "overwrite\n", stale, soulPath);
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    expect(readFileSync(soulPath, "utf8")).toBe("original\n");
    // No partial write and no temp leftovers.
    expect(readdirSync(home).sort()).toEqual(["SOUL.md", "memories"]);
  });

  test("creating a document that appeared meanwhile is a conflict, not an overwrite", async () => {
    const { store, profile, userPath } = fixture();
    writeFileSync(userPath, "written by someone else\n");
    const result = await store.save(profile, "USER.md", "mine\n", null, userPath);
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    expect(readFileSync(userPath, "utf8")).toBe("written by someone else\n");
  });

  test("only SOUL.md and USER.md are reachable", async () => {
    const { store, profile, home } = fixture();
    writeFileSync(join(home, "NOTES.md"), "secret\n");
    for (const name of ["NOTES.md", "../SOUL.md", "SOUL.md/../USER.md", "soul.md", ".."]) {
      const result = await store.read(profile, name as "SOUL.md");
      expect(result).toMatchObject({ ok: false, code: "invalid-request" });
    }
  });

  test("a traversing or relative profile home is refused", async () => {
    const { store, home } = fixture();
    for (const bad of [`${home}/../etc`, "relative/home", `${home}//sub`, `${home}/`]) {
      const result = await store.read({ alias: "server", profileId: "default", home: bad }, "SOUL.md");
      expect(result).toMatchObject({ ok: false, code: "invalid-request" });
    }
  });

  test("a symlinked document is refused and never followed", async () => {
    const { store, profile, home, soulPath } = fixture();
    const target = join(home, "target.txt");
    writeFileSync(target, "outside content\n");
    symlinkSync(target, soulPath);

    expect(await store.read(profile, "SOUL.md")).toMatchObject({ ok: false, code: "unsafe-path" });
    expect(await store.save(profile, "SOUL.md", "x\n", null, soulPath)).toMatchObject({
      ok: false,
      code: "unsafe-path",
    });
    expect(readFileSync(target, "utf8")).toBe("outside content\n");
  });

  test("a symlinked profile home is refused", async () => {
    const { store, home } = fixture();
    const real = join(home, "real");
    mkdirSync(real);
    writeFileSync(join(real, "SOUL.md"), "body\n");
    const link = join(home, "link");
    symlinkSync(real, link);
    const result = await store.read({ alias: "server", profileId: "default", home: link }, "SOUL.md");
    expect(result).toMatchObject({ ok: false, code: "unsafe-path" });
  });

  test("a non-regular document is refused", async () => {
    const { store, profile, userPath } = fixture();
    mkdirSync(userPath);
    expect(await store.read(profile, "USER.md")).toMatchObject({ ok: false, code: "unsafe-path" });
  });

  test("an oversized document is refused on read and on save", async () => {
    const { store, profile, home, soulPath, userPath } = fixture();
    writeFileSync(soulPath, "a".repeat(DOCUMENT_MAX_BYTES + 1));
    expect(await store.read(profile, "SOUL.md")).toMatchObject({ ok: false, code: "too-large" });
    const save = await store.save(profile, "USER.md", "b".repeat(DOCUMENT_MAX_BYTES + 1), null, userPath);
    expect(save).toMatchObject({ ok: false, code: "too-large" });
    expect(readdirSync(home).sort()).toEqual(["SOUL.md", "memories"]);
    expect(readdirSync(join(home, "memories"))).toEqual([]);
  });

  test("a non-UTF-8 document is refused rather than shown mangled", async () => {
    const { store, profile, soulPath } = fixture();
    writeFileSync(soulPath, Buffer.from([0x41, 0xff, 0xfe, 0x42]));
    expect(await store.read(profile, "SOUL.md")).toMatchObject({ ok: false, code: "not-utf8" });
  });

  test("the original permission bits survive a save", async () => {
    const { store, profile, home, userPath } = fixture();
    writeFileSync(userPath, "one\n");
    chmodSync(userPath, 0o640);
    const read = await store.read(profile, "USER.md");
    expect(read.ok && read.value.mode).toBe(0o640);
    const saved = await store.save(profile, "USER.md", "two\n", read.ok ? read.value.version : null, userPath);
    expect(saved.ok).toBe(true);
    expect(statSync(userPath).mode & 0o777).toBe(0o640);
    expect(readFileSync(userPath, "utf8")).toBe("two\n");
    expect(readdirSync(home)).toEqual(["memories"]);
    expect(readdirSync(join(home, "memories"))).toEqual(["USER.md"]);
  });

  test("the ssh argv is hardened and carries no request text", () => {
    const argv = new ProfileDocumentStore().buildArgv("server");
    const joined = argv.join(" ");
    for (const option of [
      "BatchMode=yes",
      "StrictHostKeyChecking=yes",
      "ClearAllForwardings=yes",
      "PermitLocalCommand=no",
      "RequestTTY=no",
      "RemoteCommand=none",
    ]) {
      expect(joined).toContain(option);
    }
    expect(argv).toContain("-T");
    // stdin carries the request, so `-n` (stdin from /dev/null) must not be present.
    expect(argv).not.toContain("-n");
    expect(argv[argv.length - 2]).toBe("server");
    expect(argv[argv.length - 3]).toBe("--");
    expect(argv[argv.length - 1]).toStartWith("python3 -c '");
    // The remote command is fixed: no home, document name or body is interpolated into it.
    expect(argv[argv.length - 1]).not.toContain("/tmp");
  });

  test("a non-ASCII body survives the JSON hop and stays inside the response bound", async () => {
    const { store, profile, soulPath } = fixture();
    const body = `한글 ${"✓".repeat(2000)}\u0007 tab\tend\n`;
    const saved = await store.save(profile, "SOUL.md", body, null, soulPath);
    expect(saved.ok).toBe(true);
    expect(readFileSync(soulPath, "utf8")).toBe(body);
    const read = await store.read(profile, "SOUL.md");
    expect(read.ok && read.value.body).toBe(body);
  });

  test("a successful-looking answer on a failed invocation is refused", async () => {
    const store = new ProfileDocumentStore(undefined, 1000, async () => ({
      stdout: '{"ok": true, "status": "absent", "version": null, "mode": null, "path": "/home/x/.hermes/SOUL.md"}',
      stderr: "ssh: connect to host server port 22: Connection refused",
      exitCode: 255,
    }));
    const result = await store.read({ alias: "server", profileId: "default", home: "/home/x/.hermes" }, "SOUL.md");
    expect(result).toMatchObject({ ok: false, code: "transport-failed" });
  });

  test("a missing remote python3 is reported as such", async () => {
    const store = new ProfileDocumentStore(undefined, 1000, async () => ({
      stdout: "",
      stderr: "bash: python3: command not found",
      exitCode: 127,
    }));
    const result = await store.read({ alias: "server", profileId: "default", home: "/home/x/.hermes" }, "SOUL.md");
    expect(result).toMatchObject({ ok: false, code: "python-missing" });
  });
});
