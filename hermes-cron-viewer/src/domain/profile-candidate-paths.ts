import type { ProfileRef } from "../types/hermes-cron";
import { checkProfileId } from "./remote-token-validator";

/** Native default Hermes home for a resolved remote `$HOME`. */
export function defaultHermesHome(remoteHome: string): string {
  return `${remoteHome}/.hermes`;
}

/** Named profiles live under `<hermes home>/profiles/<id>`. */
export function profilesRoot(remoteHome: string): string {
  return `${defaultHermesHome(remoteHome)}/profiles`;
}

/** Native profile name for the root Hermes home. */
export const DEFAULT_PROFILE_ID = "default";

/** Resolve a native profile name to its home, mirroring `get_profile_dir`. */
export function profileHome(remoteHome: string, profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID
    ? defaultHermesHome(remoteHome)
    : `${profilesRoot(remoteHome)}/${profileId}`;
}

/**
 * Turn a NUL-enumerated directory listing into selectable profiles.
 *
 * Mirrors native profile resolution: `default` is a real profile name whose home is the root
 * `.hermes` directory, and `_iter_named_profile_dirs` excludes a `profiles/default` directory from
 * the named listing. Enumerating that directory here would produce a duplicate entry pointing at a
 * home with no cron store.
 */
export function buildProfileCandidates(
  alias: string,
  remoteHome: string,
  profileDirs: readonly string[],
): { readonly profiles: readonly ProfileRef[]; readonly rejectedCount: number } {
  const root = profilesRoot(remoteHome);
  const profiles: ProfileRef[] = [
    { alias, profileId: DEFAULT_PROFILE_ID, home: defaultHermesHome(remoteHome) },
  ];
  let rejectedCount = 0;

  for (const dir of profileDirs) {
    const prefix = `${root}/`;
    if (!dir.startsWith(prefix)) {
      rejectedCount += 1;
      continue;
    }
    const profileId = dir.slice(prefix.length);
    // Native excludes `profiles/default` from the named listing; the default profile is the root.
    if (profileId === DEFAULT_PROFILE_ID) continue;
    if (profileId.includes("/") || !checkProfileId(profileId).ok) {
      rejectedCount += 1;
      continue;
    }
    profiles.push({ alias, profileId, home: `${root}/${profileId}` });
  }

  return { profiles, rejectedCount };
}
