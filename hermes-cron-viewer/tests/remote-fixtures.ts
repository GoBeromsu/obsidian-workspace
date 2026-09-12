import type { RemoteRunner } from "../src/types/remote-command";

export interface Invocation {
  readonly file: string;
  readonly args: readonly string[];
}

export const HOME = "/Users/beomsu";
export const HERMES = `${HOME}/.hermes`;

export const JOBS_JSON = JSON.stringify({
  jobs: [{ id: "job-a", last_status: "ok", next_run_at: "2026-09-12T09:00:00+09:00" }],
});

/** Fake remote whose replies are keyed by a substring of the remote command. */
export function fakeRunner(
  replies: readonly { match: string; stdout?: string; stderr?: string; exitCode?: number }[],
  log: Invocation[] = [],
): { runner: RemoteRunner; log: Invocation[] } {
  const runner: RemoteRunner = async (file, args) => {
    log.push({ file, args });
    const remoteCommand = args[args.length - 1] ?? "";
    const reply = replies.find((candidate) => remoteCommand.includes(candidate.match));
    if (reply === undefined) {
      return { stdout: "", stderr: "no such file or directory", exitCode: 1, capExceeded: false };
    }
    return {
      stdout: reply.stdout ?? "",
      stderr: reply.stderr ?? "",
      exitCode: reply.exitCode ?? 0,
      capExceeded: false,
    };
  };
  return { runner, log };
}
