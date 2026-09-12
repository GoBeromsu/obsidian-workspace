import { Menu, Setting } from "obsidian";
import type { ProfileRef } from "../types/hermes-cron";
import type { ProfileSectionOptions } from "../types/contracts";
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

  row.addToggle((toggle) =>
    toggle
      .setValue(options.isSelected(profile))
      .setTooltip("Show this profile in the viewer")
      .onChange((value) => void options.onToggle(profile, value)),
  );

  row.addExtraButton((button) => {
    button.setIcon("pencil").setTooltip("Edit profile documents");
    // ExtraButtonComponent.onClick() receives no event, but showAtMouseEvent needs one; the
    // native click listener also covers keyboard activation, which dispatches a click.
    button.extraSettingsEl.addEventListener("click", (event: MouseEvent) => {
      const menu = new Menu();
      for (const name of EDITABLE_DOCUMENT_NAMES) {
        menu.addItem((item) =>
          item
            .setTitle(name)
            .setIcon("pencil")
            .onClick(() => options.onEditDocument(profile, name)),
        );
      }
      menu.showAtMouseEvent(event);
    });
  });
}
