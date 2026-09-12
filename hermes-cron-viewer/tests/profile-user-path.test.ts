import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileRef } from "../src/types/hermes-cron";
import { REMOTE_DOCUMENT_SCRIPT } from "../src/domain/profile-document-python";
import { ProfileDocumentStore } from "../src/ui/profile-document-store";

/**
 * Native Hermes layout: `SOUL.md` at the profile home, `USER.md` inside `memories`, where
 * `memories` is itself a symlink into a local store. The remote helper runs locally exactly as it
 * would remotely (`python3 -c <script>`, request on stdin) against an isolated temp fixture: no
 * real Hermes home, no ssh and no remote host is involved.
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

const sha256 = (text: string): string => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

interface Fixture {
  readonly store: ProfileDocumentStore;
  readonly profile: ProfileRef;
  readonly home: string;
  /** Real directory `<home>/memories` points at. */
  readonly store1: string;
  /** A second real memory directory, used to retarget `memories` mid-edit. */
  readonly store2: string;
  readonly linkPath: string;
}

/** `memories` is a symlink to `store1`; `store2` exists but is not linked yet. */
function fixture(options: { readonly link?: boolean } = {}): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hcv-user-")));
  const home = join(root, ".hermes");
  const store1 = join(root, "local", "sari");
  const store2 = join(root, "local", "other");
  mkdirSync(home);
  mkdirSync(store1, { recursive: true });
  mkdirSync(store2, { recursive: true });
  const linkPath = join(home, "memories");
  if (options.link !== false) symlinkSync(store1, linkPath);
  return {
    store: new ProfileDocumentStore(undefined, 10_000, localInvoke),
    profile: { alias: "server", profileId: "default", home },
    home,
    store1,
    store2,
    linkPath,
  };
}

/** Point `memories` at `target` the way an external actor would, between a read and a save. */
function retarget(f: Fixture, target: string): void {
  rmSync(f.linkPath);
  symlinkSync(target, f.linkPath);
}

describe("native USER.md path", () => {
  test("USER.md is read through the memories symlink at its native location", async () => {
    const f = fixture();
    const native = join(f.store1, "USER.md");
    writeFileSync(native, "native memory\n");
    // A decoy at the old, no-longer-used location must be ignored entirely.
    writeFileSync(join(f.home, "USER.md"), "decoy\n");

    const read = await f.store.read(f.profile, "USER.md");
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.body).toBe("native memory\n");
    expect(read.value.version).toBe(sha256("native memory\n"));
    expect(read.value.resolvedPath).toBe(native);
  });

  test("a save writes the native USER.md only and leaves the home decoy untouched", async () => {
    const f = fixture();
    const native = join(f.store1, "USER.md");
    writeFileSync(native, "one\n");
    const decoy = join(f.home, "USER.md");
    writeFileSync(decoy, "decoy\n");

    const read = await f.store.read(f.profile, "USER.md");
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const saved = await f.store.save(f.profile, "USER.md", "two\n", read.value.version, read.value.resolvedPath);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.value.resolvedPath).toBe(native);
    expect(readFileSync(native, "utf8")).toBe("two\n");
    expect(readFileSync(decoy, "utf8")).toBe("decoy\n");
    // No temp leftovers in the real memory directory.
    expect(readdirSync(f.store1)).toEqual(["USER.md"]);
    expect(readdirSync(f.store2)).toEqual([]);
  });

  test("retargeting memories after the read is a conflict even when the new copy is identical", async () => {
    const f = fixture();
    writeFileSync(join(f.store1, "USER.md"), "same\n");
    const read = await f.store.read(f.profile, "USER.md");
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    writeFileSync(join(f.store2, "USER.md"), "same\n");
    retarget(f, f.store2);

    const saved = await f.store.save(f.profile, "USER.md", "edited\n", read.value.version, read.value.resolvedPath);
    expect(saved).toMatchObject({ ok: false, code: "conflict" });
    // Neither the original nor the substituted target was written.
    expect(readFileSync(join(f.store1, "USER.md"), "utf8")).toBe("same\n");
    expect(readFileSync(join(f.store2, "USER.md"), "utf8")).toBe("same\n");
    expect(readdirSync(f.store2)).toEqual(["USER.md"]);
  });

  test("retargeting memories to a directory without USER.md is a conflict, not a creation", async () => {
    const f = fixture();
    writeFileSync(join(f.store1, "USER.md"), "original\n");
    const read = await f.store.read(f.profile, "USER.md");
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    retarget(f, f.store2);

    const saved = await f.store.save(f.profile, "USER.md", "edited\n", read.value.version, read.value.resolvedPath);
    expect(saved).toMatchObject({ ok: false, code: "conflict" });
    expect(readdirSync(f.store2)).toEqual([]);
    expect(readFileSync(join(f.store1, "USER.md"), "utf8")).toBe("original\n");
  });

  test("a symlinked USER.md leaf is refused even inside the allowed memories directory", async () => {
    const f = fixture();
    const outside = join(f.store2, "elsewhere.md");
    writeFileSync(outside, "outside content\n");
    symlinkSync(outside, join(f.store1, "USER.md"));

    expect(await f.store.read(f.profile, "USER.md")).toMatchObject({ ok: false, code: "unsafe-path" });
    const saved = await f.store.save(f.profile, "USER.md", "x\n", null, join(f.store1, "USER.md"));
    expect(saved).toMatchObject({ ok: false, code: "unsafe-path" });
    expect(readFileSync(outside, "utf8")).toBe("outside content\n");
  });

  test("SOUL.md stays at the profile home and ignores the memories symlink", async () => {
    const f = fixture();
    writeFileSync(join(f.store1, "SOUL.md"), "memory-dir soul\n");
    const soulPath = join(f.home, "SOUL.md");

    const read = await f.store.read(f.profile, "SOUL.md");
    expect(read).toEqual({ ok: true, value: { body: "", version: null, mode: null, resolvedPath: soulPath } });

    const saved = await f.store.save(f.profile, "SOUL.md", "home soul\n", null, soulPath);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.value.resolvedPath).toBe(soulPath);
    expect(readFileSync(soulPath, "utf8")).toBe("home soul\n");
    expect(readFileSync(join(f.store1, "SOUL.md"), "utf8")).toBe("memory-dir soul\n");
  });

  test("a missing memories directory is reported and never created implicitly", async () => {
    const f = fixture({ link: false });
    expect(await f.store.read(f.profile, "USER.md")).toMatchObject({ ok: false, code: "io-failed" });
    const saved = await f.store.save(f.profile, "USER.md", "body\n", null, join(f.home, "memories", "USER.md"));
    expect(saved).toMatchObject({ ok: false, code: "io-failed" });
    expect(existsSync(f.linkPath)).toBe(false);
    expect(readdirSync(f.home)).toEqual([]);
  });

  test("a dangling memories symlink is refused without writing anything", async () => {
    const f = fixture({ link: false });
    symlinkSync(join(f.home, "gone"), f.linkPath);
    const read = await f.store.read(f.profile, "USER.md");
    expect(read.ok).toBe(false);
    if (!read.ok) expect(["io-failed", "unsafe-path"]).toContain(read.code);
    expect(existsSync(join(f.home, "gone"))).toBe(false);
  });
});
