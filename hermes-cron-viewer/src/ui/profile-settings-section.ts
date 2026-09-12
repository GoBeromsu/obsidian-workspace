import { Setting, setIcon } from "obsidian";
import type { ProfileRef } from "../types/hermes-cron";
import type { ProfileSectionOptions } from "../types/contracts";
import type { ProfileDocumentName } from "../types/profile-document";
import { EDITABLE_DOCUMENT_NAMES } from "../types/profile-document";

/**
 * Render the profile section: one heading per server, then its profile rows.
 *
 * Kept apart from the settings tab so the toggle plus document-action widget group exists once.
 * Returns the number of rows rendered so the caller can show an empty-state note instead.
 */
export function renderProfileSection(parent: HTMLElement, options: ProfileSectionOptions): number {
  let rendered = 0;
  for (const alias of options.sources.servers) {
    const profiles = profilesOf(alias, options.sources);
    if (profiles.length === 0) continue;
    new Setting(parent).setName(alias).setHeading();
    for (const profile of profiles) renderProfileRow(parent, profile, options);
    rendered += profiles.length;
  }
  return rendered;
}

/**
 * Profiles known for one server: previously selected sources and restored snapshots merged with
 * this session's discovery, so reopening settings is never blank. Nothing is selected here.
 */
function profilesOf(
  alias: string,
  sources: ProfileSectionOptions["sources"],
): readonly ProfileRef[] {
  const byId = new Map<string, ProfileRef>();
  for (const profile of sources.known) {
    if (profile.alias === alias) byId.set(profile.profileId, profile);
  }
  for (const profile of sources.discovered.get(alias) ?? []) byId.set(profile.profileId, profile);
  return [...byId.values()].sort((a, b) => a.profileId.localeCompare(b.profileId));
}

function renderProfileRow(
  parent: HTMLElement,
  profile: ProfileRef,
  options: ProfileSectionOptions,
): void {
  const row = new Setting(parent).setName(profile.profileId).setDesc(profile.home);

  // Edit buttons first so the two related actions sit together, left of the rightmost toggle.
  for (const name of EDITABLE_DOCUMENT_NAMES) addEditButton(row, profile, name, options);

  row.addToggle((toggle) =>
    toggle
      .setValue(options.isSelected(profile))
      .setTooltip("Show this profile in the viewer")
      .onChange((value) => void options.onToggle(profile, value)),
  );
}

/**
 * One small pencil+label button that opens the editor for a single allowlisted document.
 *
 * `ButtonComponent.setIcon()` replaces the button contents, so the icon is rendered into its own
 * span next to the text instead.
 */
function addEditButton(
  row: Setting,
  profile: ProfileRef,
  name: ProfileDocumentName,
  options: ProfileSectionOptions,
): void {
  const label = name.replace(/\.md$/, "");
  const description = `Edit ${name} for ${profile.profileId}`;
  row.addButton((button) => {
    button.setTooltip(description).onClick(() => options.onEditDocument(profile, name));
    button.buttonEl.addClass("hcv-profile-action");
    button.buttonEl.setAttribute("aria-label", description);
    const icon = button.buttonEl.createSpan({ cls: "hcv-profile-action-icon" });
    setIcon(icon, "pencil");
    button.buttonEl.createSpan({ text: label });
  });
}
