import { Setting } from "obsidian";
import { checkAlias } from "../domain/remote-token-validator";
import type { ServerSectionOptions } from "../types/contracts";

/**
 * Render the connection section: the add row, then one row per registered SSH target.
 *
 * Kept apart from the settings tab so the three-icon row (edit, check, remove) exists once.
 * Every action is a callback; this module owns no state and performs no persistence.
 */
export function renderServerSection(parent: HTMLElement, options: ServerSectionOptions): void {
  renderAddRow(parent, options);
  if (options.servers.length === 0) {
    parent.createEl("p", { cls: "hcv-settings-note", text: "No SSH host alias registered yet." });
    return;
  }
  for (const alias of options.servers) renderServerRow(parent, alias, options);
}

function renderAddRow(parent: HTMLElement, options: ServerSectionOptions): void {
  let pending = "";
  const row = new Setting(parent)
    .setName("Add SSH host alias")
    .setDesc("An alias defined in ~/.ssh/config with key authentication already configured.")
    .addText((text) => {
      text.setPlaceholder("m1-file").onChange((value) => {
        pending = value.trim();
      });
    })
    .addExtraButton((button) =>
      button.setIcon("plus").setTooltip("Add server").onClick(() => {
        if (pending === "") return;
        const rejection = !checkAlias(pending).ok
          ? "Use 1-64 characters: letters, digits, dot, underscore or hyphen."
          : options.servers.includes(pending)
            ? "That SSH host alias is already registered."
            : null;
        if (rejection !== null) {
          row.setDesc(rejection);
          return;
        }
        options.onAdd(pending);
      }),
    );
}

function renderServerRow(parent: HTMLElement, alias: string, options: ServerSectionOptions): void {
  new Setting(parent)
    .setName(alias)
    .setDesc(options.statusOf(alias))
    .addExtraButton((button) =>
      button
        .setIcon("pencil")
        .setTooltip("Edit connection target")
        .setDisabled(options.isBusy(alias))
        .onClick(() => options.onEdit(alias)),
    )
    .addExtraButton((button) =>
      button
        .setIcon("plug")
        .setTooltip("Check connection and list profiles")
        .setDisabled(options.isBusy(alias))
        .onClick(() => options.onCheck(alias)),
    )
    .addExtraButton((button) =>
      button.setIcon("trash").setTooltip("Remove server").onClick(() => options.onRemove(alias)),
    );
}
