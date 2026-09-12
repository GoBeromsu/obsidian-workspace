import type { DiscoveryResult } from "../types/snapshot";
import {
  CANARY_LITERAL,
  buildListProfileDirs,
  buildResolveHome,
  buildShellCanary,
} from "../domain/discovery-command-builder";
import { buildProfileCandidates, profilesRoot } from "../domain/profile-candidate-paths";
import { splitNulRecords } from "../domain/response-bound";
import type { SshReadOnlyAdapter } from "./ssh-read-only-adapter";

function failure(alias: string, detail: string, transport: DiscoveryResult["transport"]): DiscoveryResult {
  return { alias, transport, profiles: [], detail };
}

/**
 * Discover selectable Hermes profiles on one server.
 *
 * Order matters: the shell canary proves the quoting contract holds, then `$HOME` gives the
 * absolute base (a quoted `~` is never expanded), then directory names are enumerated. Only names
 * and directories are read here - no `jobs.json`, output body or settings content is fetched
 * before the user selects a profile.
 */
export async function discoverProfiles(
  adapter: SshReadOnlyAdapter,
  alias: string,
): Promise<DiscoveryResult> {
  const canaryCommand = buildShellCanary();
  if (!canaryCommand.ok) return failure(alias, canaryCommand.detail, "disconnected");
  const canary = await adapter.run(alias, canaryCommand.command);
  if (canary.transport !== "connected") return failure(alias, canary.stderr.trim(), canary.transport);
  if (canary.stdout.trim() !== CANARY_LITERAL) {
    return failure(
      alias,
      "remote login shell did not echo the canary literal byte for byte",
      "config-incompatible-shell",
    );
  }

  const homeCommand = buildResolveHome();
  if (!homeCommand.ok) return failure(alias, homeCommand.detail, "disconnected");
  const homeResult = await adapter.run(alias, homeCommand.command);
  if (homeResult.transport !== "connected") {
    return failure(alias, homeResult.stderr.trim(), homeResult.transport);
  }
  const remoteHome = homeResult.stdout.trim();
  if (!remoteHome.startsWith("/")) {
    return failure(alias, `remote home is not an absolute path: ${remoteHome}`, "disconnected");
  }

  const listCommand = buildListProfileDirs(profilesRoot(remoteHome));
  if (!listCommand.ok) return failure(alias, listCommand.detail, "connected");
  const listing = await adapter.run(alias, listCommand.command);
  // A missing profiles directory is normal: the default profile still exists.
  const dirs =
    listing.transport === "connected"
      ? splitNulRecords(listing.stdout, listing.capExceeded)
      : [];

  const { profiles, rejectedCount } = buildProfileCandidates(alias, remoteHome, dirs);
  const detail = rejectedCount > 0
    ? `${rejectedCount} directory name(s) did not match the native profile id contract and were skipped`
    : null;
  return { alias, transport: "connected", profiles, detail };
}
