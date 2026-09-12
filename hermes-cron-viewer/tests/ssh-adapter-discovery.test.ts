import { describe, expect, test } from "bun:test";
import { SshReadOnlyAdapter, classifyTransport } from "../src/ui/ssh-read-only-adapter";
import { discoverProfiles } from "../src/ui/profile-discovery-runner";
import { CANARY_LITERAL } from "../src/domain/discovery-command-builder";
import { fakeRunner, HERMES, HOME } from "./remote-fixtures";


function discoveryReplies() {
  return [
    { match: "printf '%s\\n' 'it'", stdout: `${CANARY_LITERAL}\n` },
    { match: `printf '%s\\n' "$HOME"`, stdout: `${HOME}\n` },
    { match: `${HERMES}/profiles`, stdout: `${HERMES}/profiles/xia\u0000${HERMES}/profiles/ossplatform\u0000` },
  ];
}

describe("ssh adapter", () => {
  test("pins fixed options and the alias position", () => {
    const { runner } = fakeRunner([]);
    const adapter = new SshReadOnlyAdapter({ runner });
    const argv = adapter.buildArgv("m1-file", {
      kind: "readJobsJson",
      remoteCommand: "head -c 1 '/x'",
      byteCap: 1,
      nulSeparated: false,
    });

    expect(argv).toContain("BatchMode=yes");
    expect(argv).toContain("StrictHostKeyChecking=yes");
    expect(argv).toContain("ClearAllForwardings=yes");
    expect(argv).toContain("PermitLocalCommand=no");
    expect(argv).toContain("RequestTTY=no");
    expect(argv).not.toContain("StrictHostKeyChecking=no");
    expect(argv).not.toContain("StrictHostKeyChecking=accept-new");

    const separator = argv.indexOf("--");
    expect(separator).toBeGreaterThan(0);
    expect(argv[separator + 1]).toBe("m1-file");
    expect(argv[separator + 2]).toBe("head -c 1 '/x'");
  });

  test("refuses an alias that could be read as an option", () => {
    const { runner } = fakeRunner([]);
    const adapter = new SshReadOnlyAdapter({ runner });
    expect(() =>
      adapter.buildArgv("-oProxyCommand=curl evil", {
        kind: "resolveHome", remoteCommand: "x", byteCap: 1, nulSeparated: false,
      }),
    ).toThrow();
  });

  test("classifies the transport vocabulary", () => {
    expect(classifyTransport(255, "Host key verification failed.")).toBe("host-key-unknown");
    expect(classifyTransport(255, "Permission denied (publickey).")).toBe("auth-failed");
    expect(classifyTransport(255, "Operation timed out")).toBe("timeout");
    expect(classifyTransport(255, "Cannot execute command-line and remote command.")).toBe(
      "config-conflict-remote-command",
    );
    expect(classifyTransport(127, "zsh: command not found: sqlite3")).toBe("command-missing");
    expect(classifyTransport(255, "ProxyCommand failed")).toBe("proxy-failed");
    expect(classifyTransport(0, "")).toBe("connected");
  });
});

describe("profile discovery", () => {
  test("resolves home, enumerates profiles and keeps the root default distinct", async () => {
    const { runner, log } = fakeRunner(discoveryReplies());
    const result = await discoverProfiles(new SshReadOnlyAdapter({ runner }), "m1-file");

    expect(result.transport).toBe("connected");
    expect(result.profiles.map((profile) => profile.profileId)).toEqual(["default", "xia", "ossplatform"]);
    expect(result.profiles[0]?.home).toBe(HERMES);
    expect(result.profiles[1]?.home).toBe(`${HERMES}/profiles/xia`);

    // Discovery must not read any body before selection.
    const commands = log.map((entry) => entry.args[entry.args.length - 1] ?? "");
    expect(commands.some((command) => command.includes("jobs.json"))).toBe(false);
    expect(commands.some((command) => command.includes("output"))).toBe(false);
    expect(commands.some((command) => command.includes("sqlite3"))).toBe(false);
  });

  test("fails closed when the remote shell mangles the canary", async () => {
    const { runner } = fakeRunner([{ match: "printf '%s\\n' 'it'", stdout: "it s X b ok\n" }]);
    const result = await discoverProfiles(new SshReadOnlyAdapter({ runner }), "m1-file");
    expect(result.transport).toBe("config-incompatible-shell");
    expect(result.profiles).toHaveLength(0);
  });

  test("reports a RemoteCommand config conflict instead of a generic disconnect", async () => {
    const { runner } = fakeRunner([
      { match: "printf", stderr: "Cannot execute command-line and remote command.", exitCode: 255 },
    ]);
    const result = await discoverProfiles(new SshReadOnlyAdapter({ runner }), "m1");
    expect(result.transport).toBe("config-conflict-remote-command");
  });

  test("a missing profiles directory still yields the default profile", async () => {
    const { runner } = fakeRunner([
      { match: "printf '%s\\n' 'it'", stdout: `${CANARY_LITERAL}\n` },
      { match: `printf '%s\\n' "$HOME"`, stdout: `${HOME}\n` },
    ]);
    const result = await discoverProfiles(new SshReadOnlyAdapter({ runner }), "m1-file");
    expect(result.profiles.map((profile) => profile.profileId)).toEqual(["default"]);
  });
});
