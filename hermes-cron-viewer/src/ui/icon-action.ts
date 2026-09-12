import { setIcon } from "obsidian";

/**
 * One icon-only action button with an accessible name, since the icon alone carries no meaning.
 *
 * Shared by the bounded document surfaces so every icon action exposes the same label, title and
 * explicit `type="button"` (no implicit form submission).
 */
export function iconButton(
  parent: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "hcv-doc-action",
    attr: { "aria-label": label, title: label, type: "button" },
  });
  setIcon(button, icon);
  button.addEventListener("click", onClick);
  return button;
}
