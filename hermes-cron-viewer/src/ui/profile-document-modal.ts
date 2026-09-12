import { Modal, type App } from "obsidian";
import type { ProfileRef } from "../types/hermes-cron";
import type { ConfirmationSpec, DocumentVersion, ProfileDocumentName } from "../types/profile-document";
import {
  DiscardConfirmationModal,
  discardChangesPrompt,
  reloadFromServerPrompt,
  saveInProgressPrompt,
} from "./discard-confirmation-modal";
import { iconButton } from "./icon-action";
import { ProfileDocumentStore } from "./profile-document-store";
type Phase = "loading" | "ready" | "failed";

/**
 * Bounded editor for one profile document (`SOUL.md` or `USER.md`).
 *
 * The body lives in this modal's memory only: it is never written to disk locally, never logged
 * and never snapshotted. Saving is always an explicit user action - there is no autosave, and a
 * missing document is created only when the user presses Save.
 */
export class ProfileDocumentModal extends Modal {
  private readonly store: ProfileDocumentStore;
  private phase: Phase = "loading";
  private message: string | null = null;
  /** Editor buffer. Authoritative while the modal is open. */
  private buffer = "";
  /** Last body confirmed to match the server at `version`. */
  private baseline = "";
  private version: DocumentVersion = null;
  /**
   * Absolute file the open buffer was read from, as resolved by the server.
   *
   * Shown to the user and sent back with an explicit Save so the write is bound to that exact
   * target: if `memories` was retargeted meanwhile, the server refuses instead of writing
   * somewhere else. Empty only before the first successful read.
   */
  private resolvedPath = "";
  private busy = false;
  private conflict = false;
  /** Guards against a late reply from a request that outlived the modal. */
  private closed = false;
  /** Set once the user has confirmed losing the buffer, so `close()` may proceed. */
  private closeApproved = false;
  private confirming = false;

  constructor(
    app: App,
    private readonly profile: ProfileRef,
    private readonly name: ProfileDocumentName,
    store?: ProfileDocumentStore,
  ) {
    super(app);
    this.store = store ?? new ProfileDocumentStore();
  }

  private get dirty(): boolean {
    return this.buffer !== this.baseline;
  }

  /** A document that does not exist yet can be created even with an empty, unedited buffer. */
  private get savable(): boolean {
    return this.phase === "ready" && !this.busy && (this.dirty || this.version === null);
  }

  override async onOpen(): Promise<void> {
    (this.modalEl as HTMLElement | undefined)?.addClass("hcv-doc-modal");
    this.render();
    await this.load();
  }

  /**
   * Single close gate for every route out of the modal: Cancel, the X, Escape and the backdrop.
   *
   * An in-flight save is never abandoned silently, and an unsaved buffer is never dropped without
   * an explicit confirmation.
   */
  override close(): void {
    if (this.closeApproved) {
      super.close();
      return;
    }
    if (this.busy) {
      this.ask(saveInProgressPrompt(this.name), () => this.forceClose());
      return;
    }
    if (!this.dirty) {
      super.close();
      return;
    }
    this.ask(discardChangesPrompt(this.name), () => this.forceClose());
  }

  override onClose(): void {
    this.closed = true;
    this.contentEl.empty();
  }

  private forceClose(): void {
    this.closeApproved = true;
    this.close();
  }

  /** Open one confirmation at a time; `onConfirmed` runs only on an explicit yes. */
  private ask(spec: ConfirmationSpec, onConfirmed: () => void): void {
    if (this.confirming) return;
    this.confirming = true;
    new DiscardConfirmationModal(this.app, spec, (confirmed) => {
      this.confirming = false;
      if (confirmed) onConfirmed();
    }).open();
  }

  private async load(): Promise<void> {
    this.busy = true;
    this.render();
    const result = await this.store.read(this.profile, this.name);
    if (this.closed) return;
    this.busy = false;
    if (!result.ok) {
      this.phase = "failed";
      this.message = `Could not read ${this.name} (${result.code}): ${result.detail}`;
      this.render();
      return;
    }
    this.phase = "ready";
    this.conflict = false;
    this.version = result.value.version;
    this.resolvedPath = result.value.resolvedPath;
    this.baseline = result.value.body;
    this.buffer = result.value.body;
    this.message = result.value.version === null
      ? `${this.name} does not exist yet. Saving creates it.`
      : null;
    this.render();
  }

  private async save(): Promise<void> {
    if (!this.savable) return;
    this.busy = true;
    this.message = null;
    this.render();
    const body = this.buffer;
    const result = await this.store.save(this.profile, this.name, body, this.version, this.resolvedPath);
    if (this.closed) return;
    this.busy = false;
    if (!result.ok) {
      // The buffer is kept exactly as typed in every failure case, including a conflict.
      this.conflict = result.code === "conflict";
      this.message = this.conflict
        ? `${this.name} changed on the server. Your text is kept here; reload to see the server copy.`
        : `Save failed (${result.code}): ${result.detail}`;
      this.render();
      return;
    }
    this.conflict = false;
    this.version = result.value.version;
    this.resolvedPath = result.value.resolvedPath;
    this.baseline = body;
    this.message = `Saved ${this.name}.`;
    this.render();
  }

  /** Explicit, confirmed discard of the local buffer in favour of the server copy. */
  private reloadFromServer(): void {
    if (this.busy) return;
    if (!this.dirty) {
      void this.load();
      return;
    }
    this.ask(reloadFromServerPrompt(this.name), () => void this.load());
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("hcv-doc");

    const header = root.createDiv({ cls: "hcv-doc-header" });
    const heading = header.createDiv({ cls: "hcv-doc-heading" });
    heading.createEl("h2", { cls: "hcv-doc-title", text: this.name });
    heading.createSpan({
      cls: "hcv-doc-subject",
      text: `${this.profile.alias} / ${this.profile.profileId} - ${this.profile.home}`,
    });
    // The actual file, which for `USER.md` may resolve through a `memories` symlink. Quiet
    // metadata only: the path is not the document body and is never logged.
    if (this.resolvedPath !== "") {
      heading.createSpan({
        cls: "hcv-doc-subject hcv-doc-path",
        text: this.resolvedPath,
        attr: { title: this.resolvedPath },
      });
    }
    iconButton(header, "refresh-cw", `Reload ${this.name} from the server`, () => this.reloadFromServer());

    if (this.phase === "loading") {
      root.createEl("p", { cls: "hcv-doc-status", text: `Loading ${this.name}...` });
      return;
    }

    if (this.message !== null) {
      root.createEl("p", {
        cls: this.conflict || this.phase === "failed" ? "hcv-doc-error" : "hcv-doc-status",
        text: this.message,
      });
    }

    if (this.phase === "failed") {
      const actions = root.createDiv({ cls: "hcv-doc-actions" });
      iconButton(actions, "rotate-ccw", "Try reading the document again", () => void this.load());
      iconButton(actions, "x", "Close", () => this.close());
      return;
    }

    const editor = root.createEl("textarea", {
      cls: "hcv-doc-editor",
      attr: { "aria-label": `${this.name} contents`, spellcheck: "false" },
    });
    editor.value = this.buffer;
    editor.disabled = this.busy;
    editor.addEventListener("input", () => {
      this.buffer = editor.value;
      this.updateActionState();
    });

    const actions = root.createDiv({ cls: "hcv-doc-actions" });
    actions.createSpan({ cls: "hcv-doc-dirty", text: this.stateLabel });
    const save = iconButton(actions, "save", `Save ${this.name}`, () => void this.save());
    save.addClass("hcv-doc-save");
    save.disabled = !this.savable;
    iconButton(actions, "x", "Cancel and close", () => this.close());
  }

  private get stateLabel(): string {
    if (this.busy) return "Working...";
    if (this.dirty) return "Unsaved changes";
    return this.version === null ? "Not created yet" : "No unsaved changes";
  }

  /** Keep the dirty indicator and Save availability current without rebuilding the editor. */
  private updateActionState(): void {
    const save = this.contentEl.querySelector<HTMLButtonElement>(".hcv-doc-save");
    if (save !== null) save.disabled = !this.savable;
    const flag = this.contentEl.querySelector<HTMLElement>(".hcv-doc-dirty");
    if (flag !== null) flag.textContent = this.stateLabel;
  }
}
