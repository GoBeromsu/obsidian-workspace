import { Modal, type App } from "obsidian";
import type { ConfirmationSpec } from "../types/profile-document";

/**
 * Native two-choice confirmation.
 *
 * `window.confirm` is deliberately not used: it is not dependable inside Obsidian's Electron shell
 * and would block the renderer. Dismissing this modal counts as "no", so a discard never happens
 * by accident.
 */
export class DiscardConfirmationModal extends Modal {
  private decided = false;

  constructor(
    app: App,
    private readonly spec: ConfirmationSpec,
    private readonly onDecision: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.contentEl.addClass("hcv-doc-confirm");
    this.contentEl.createEl("h3", { text: this.spec.title });
    this.contentEl.createEl("p", { text: this.spec.question });
    const actions = this.contentEl.createDiv({ cls: "hcv-doc-confirm-actions" });
    const cancel = actions.createEl("button", { text: this.spec.cancelLabel, attr: { type: "button" } });
    cancel.addEventListener("click", () => this.decide(false));
    const confirm = actions.createEl("button", {
      cls: "mod-warning",
      text: this.spec.confirmLabel,
      attr: { type: "button" },
    });
    confirm.addEventListener("click", () => this.decide(true));
    confirm.focus();
  }

  override onClose(): void {
    this.contentEl.empty();
    // Escape, the X and the backdrop all land here: an undecided dismissal means "no".
    if (!this.decided) {
      this.decided = true;
      this.onDecision(false);
    }
  }

  private decide(confirmed: boolean): void {
    if (this.decided) return;
    this.decided = true;
    this.onDecision(confirmed);
    this.close();
  }
}

export function saveInProgressPrompt(name: string): ConfirmationSpec {
  return {
    title: "Save in progress",
    question: `${name} is still being saved. Closing now abandons the result of that save.`,
    confirmLabel: "Close anyway",
    cancelLabel: "Keep waiting",
  };
}

export function discardChangesPrompt(name: string): ConfirmationSpec {
  return {
    title: "Discard unsaved changes?",
    question: `Your edits to ${name} have not been saved and will be lost.`,
    confirmLabel: "Discard and close",
    cancelLabel: "Keep editing",
  };
}

export function reloadFromServerPrompt(name: string): ConfirmationSpec {
  return {
    title: "Reload from the server?",
    question: `Your unsaved edits to ${name} will be replaced by the server copy.`,
    confirmLabel: "Discard and reload",
    cancelLabel: "Keep editing",
  };
}
