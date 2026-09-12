import type {
  BoundRemoteCommand,
  RemoteExecOutcome,
  RemoteRunner,
  TransportStatus,
} from "../types/remote-command";
import { COMMAND_TIMEOUT_MS } from "../types/remote-command";
import { checkAlias } from "../domain/remote-token-validator";
import type { SshAdapterOptions } from "../types/contracts";

/**
 * Options fixed on the command line. These win over the user's ssh config for the keywords they
 * name. `ProxyJump`, `ProxyCommand` and `Match exec` are deliberately NOT overridden: the plan
 * reuses the user's existing connection path, and those directives can execute local commands.
 * That is a documented trust boundary, not a claim that they cannot run.
 */
const FIXED_OPTIONS: readonly string[] = [
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=yes",
  "-o", "ConnectTimeout=15",
  "-o", "ClearAllForwardings=yes",
  "-o", "PermitLocalCommand=no",
  "-o", "RequestTTY=no",
  "-T",
  "-n",
];

/**
 * Classify an invocation into the transport vocabulary (plan section 6).
 *
 * ssh reports its own failures with exit 255; any other non-zero code belongs to the remote
 * program, which means the transport worked. Treating a remote `sqlite3` error as a transport
 * failure would hide the real cause from the source axis, so only ssh-level failures and a missing
 * remote command are transport states here.
 */
export function classifyTransport(exitCode: number | null, stderr: string): TransportStatus {
  const text = stderr.toLowerCase();
  if (exitCode === 127 || text.includes("command not found")) return "command-missing";

  // Anything other than ssh's own 255 (or a spawn failure) came from the remote program.
  if (exitCode !== null && exitCode !== 255) return "connected";

  if (text.includes("cannot execute command-line and remote command")) {
    return "config-conflict-remote-command";
  }
  if (text.includes("host key verification failed") || text.includes("no matching host key")) {
    return "host-key-unknown";
  }
  if (text.includes("permission denied") || text.includes("too many authentication failures")) {
    return "auth-failed";
  }
  if (text.includes("operation timed out") || text.includes("connection timed out")) {
    return "timeout";
  }
  if (text.includes("proxycommand") || text.includes("proxyjump") || text.includes("via jump host")) {
    return "proxy-failed";
  }
  return "disconnected";
}

/**
 * Runs one bound remote command over the user's existing ssh configuration.
 *
 * The local side uses argv (no local shell). `--` pins the alias position so neither the alias nor
 * a path can be read as an option. Nothing here creates, copies or stores keys or known_hosts
 * entries.
 */
export class SshReadOnlyAdapter {
  private readonly runner: RemoteRunner;
  private readonly timeoutMs: number;

  constructor(options: SshAdapterOptions) {
    this.runner = options.runner;
    this.timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS;
  }

  /** Build the exact ssh argv for a bound command, or throw when the alias is invalid. */
  buildArgv(alias: string, command: BoundRemoteCommand): readonly string[] {
    const aliasCheck = checkAlias(alias);
    if (!aliasCheck.ok) {
      throw new Error(`refusing to run against alias ${alias}: ${aliasCheck.detail}`);
    }
    return [...FIXED_OPTIONS, "--", alias, command.remoteCommand];
  }

  async run(alias: string, command: BoundRemoteCommand): Promise<RemoteExecOutcome> {
    const argv = this.buildArgv(alias, command);
    try {
      const result = await this.runner("ssh", argv, {
        timeoutMs: this.timeoutMs,
        // Request one byte past the bound so an overflow is detectable.
        maxBytes: command.byteCap + 1,
      });
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        capExceeded: result.capExceeded,
        transport: classifyTransport(result.exitCode, result.stderr),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        stdout: "",
        stderr: message,
        exitCode: null,
        capExceeded: false,
        transport: message.toLowerCase().includes("timed out") ? "timeout" : "disconnected",
      };
    }
  }
}
