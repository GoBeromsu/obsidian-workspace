import { Modal, type App } from "obsidian";
import type { TargetChangeResult } from "../types/contracts";

/** User-facing reason per rejected target, so the message names the exact problem. */
export function describeTargetFailure(reason: Exclude<TargetChangeResult, { ok: true }>["reason"]): string {
  if (reason === "invalid") return "Use 1-64 characters: letters, digits, dot, underscore or hyphen.";
  if (reason === "duplicate") return "That SSH target is already registered.";
  return "This server is no longer registered. Close this dialog and reopen settings.";
}

/**
 * Edits the SSH target of one registered server.
 *
 * The target is the single value this plugin stores: an alias from `~/.ssh/config` or a hostname
 * that `ssh` can resolve on its own. HostName, User, Port, ProxyJump and key material keep coming
 * from your SSH configuration and agent - this dialog never reads or writes `~/.ssh/config`.
 */
export class ConnectionTargetModal extends Modal {
  private buffer: string;
  private message: string | null = null;
  private busy = false;
  private closed = false;

  constructor(
    app: App,
    private readonly current: string,
    private readonly submit: (target: string) => Promise<TargetChangeResult>,
    private readonly onSaved?: () => void,
  ) {
    super(app);
    this.buffer = current;
  }

  override onOpen(): void {
    this.render();
  }

  /** An in-flight save is never abandoned silently, and closing never reports success. */
  override close(): void {
    if (this.busy) {
      this.message = "Saving. Wait until it finishes.";
      this.render();
      return;
    }
    super.close();
  }

  override onClose(): void {
    this.closed = true;
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    if (this.busy) return;
    const target = this.buffer.trim();
    if (target === "") {
      this.message = "Enter an SSH target.";
      this.render();
      return;
    }
    if (target === this.current) {
      // Nothing to invalidate: leave every selection, cache and snapshot exactly as it is.
      super.close();
      return;
    }
    this.busy = true;
    this.message = "Saving...";
    this.render();
    let result: TargetChangeResult;
    try {
      result = await this.submit(target);
    } catch {
      this.busy = false;
      this.message = "Could not save the new target. Nothing was changed.";
      this.render();
      return;
    }
    if (this.closed) return;
    this.busy = false;
    if (!result.ok) {
      this.message = describeTargetFailure(result.reason);
      this.render();
      return;
    }
    this.onSaved?.();
    super.close();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();

    root.createEl("h2", { text: "Edit connection target" });
    root.createEl("p", {
      cls: "hcv-settings-note",
      text: "The target is an SSH alias from ~/.ssh/config, or a hostname ssh can resolve. HostName, User, Port, ProxyJump and keys still come from your SSH configuration and agent; this plugin never edits ~/.ssh/config.",
    });

    const input = root.createEl("input", {
      attr: { type: "text", "aria-label": "SSH target", spellcheck: "false" },
    }) as HTMLInputElement;
    input.value = this.buffer;
    input.disabled = this.busy;
    input.addEventListener("input", () => {
      this.buffer = input.value;
    });

    root.createEl("p", {
      cls: "hcv-settings-note",
      text: "Changing the target may point at a different machine. Saving clears this server's profile selections, cached schedule metadata and the remembered remote home, and marks the new target as not checked yet. Run the connection check again to rediscover profiles.",
    });

    if (this.message !== null) root.createEl("p", { cls: "hcv-doc-status", text: this.message });

    const actions = root.createDiv({ cls: "hcv-doc-actions" });
    const save = actions.createEl("button", {
      text: "Save",
      attr: { type: "button" },
    }) as HTMLButtonElement;
    save.disabled = this.busy;
    save.addEventListener("click", () => void this.save());
    const cancel = actions.createEl("button", {
      text: "Cancel",
      attr: { type: "button" },
    }) as HTMLButtonElement;
    cancel.addEventListener("click", () => this.close());
  }
}
