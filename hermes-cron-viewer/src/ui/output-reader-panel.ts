import { setIcon } from "obsidian";
import type { OutputFileIndex, ProfileRef } from "../types/hermes-cron";
import type { OutputReaderActions, OutputReaderView } from "../types/view";
import { buildReadOutputFile } from "../domain/read-command-builder";
import { NOTICES } from "./notices";
import type { SshReadOnlyAdapter } from "./ssh-read-only-adapter";
import type { VerbatimMemoryStore } from "./verbatim-memory-store";

/**
 * Selection and body-read state for the output reader, held per open modal.
 *
 * Nothing is persisted and nothing is fetched until the user opens a specific file. A reply that
 * arrives after the user moved on is discarded by request generation, so a stale or failed read
 * can never overwrite the file the reader currently shows.
 */
export class OutputReaderState {
  private selected: string | null = null;
  private error: string | null = null;
  private loading = false;
  private request = 0;

  constructor(
    private readonly profile: ProfileRef,
    private readonly jobId: string,
    private readonly adapter: SshReadOnlyAdapter,
    private readonly bodies: VerbatimMemoryStore,
    private readonly onChange: () => void,
  ) {}

  get fileName(): string | null {
    return this.selected;
  }

  key(fileName: string): string {
    return `${this.profile.alias}\u0000${this.profile.profileId}\u0000${this.jobId}\u0000${fileName}`;
  }

  /** Open one file: a held body is shown immediately, anything else is read once, on demand. */
  async open(fileName: string): Promise<void> {
    this.selected = fileName;
    this.error = null;
    const request = (this.request += 1);
    if (this.bodies.has(this.key(fileName))) {
      this.loading = false;
      this.onChange();
      return;
    }
    this.loading = true;
    this.onChange();

    const error = await this.readBody(fileName);
    if (request !== this.request) return;
    this.loading = false;
    this.error = error;
    this.onChange();
  }

  /** Only a successful read is cached; a failed read must never become an empty body. */
  private async readBody(fileName: string): Promise<string | null> {
    const command = buildReadOutputFile(this.profile.home, this.jobId, fileName);
    if (!command.ok) return `${command.code}: ${command.detail}`;
    const outcome = await this.adapter.run(this.profile.alias, command.command);
    if (outcome.transport === "connected" && (outcome.exitCode ?? 0) === 0) {
      this.bodies.set(this.key(fileName), outcome.stdout, outcome.capExceeded);
      return null;
    }
    return outcome.stderr.trim() === ""
      ? `could not read this output file (${outcome.transport})`
      : outcome.stderr.trim();
  }

  /** Leave the reader; an in-flight read for the abandoned file is invalidated. */
  back(): void {
    this.request += 1;
    this.selected = null;
    this.error = null;
    this.loading = false;
    this.onChange();
  }

  /** Step through the existing index order; `null` at either end disables that action. */
  step(outputs: OutputFileIndex, offset: number): (() => void) | null {
    const index = outputs.files.findIndex((file) => file.fileName === this.selected);
    const next = outputs.files[index + offset];
    if (index < 0 || next === undefined) return null;
    return () => void this.open(next.fileName);
  }

  /** Render the reader for the currently selected file. */
  render(parent: HTMLElement, outputs: OutputFileIndex): void {
    const fileName = this.selected;
    if (fileName === null) return;
    renderOutputReader(
      parent,
      { fileName, entry: this.bodies.get(this.key(fileName)), error: this.error, loading: this.loading },
      {
        onBack: () => this.back(),
        onPrevious: this.step(outputs, -1),
        onNext: this.step(outputs, 1),
      },
    );
  }
}

/**
 * The reading pane for exactly one output file.
 *
 * The file list is not rendered beside it: selecting a file replaces the list, so the body is read
 * in a single context and never appended underneath the whole list. Nothing is summarized or
 * reformatted; the stored bytes are placed in a text node.
 */
export function renderOutputReader(
  parent: HTMLElement,
  view: OutputReaderView,
  actions: OutputReaderActions,
): void {
  const bar = parent.createDiv({
    cls: "hcv-reader-bar",
    attr: { role: "toolbar", "aria-label": "Output reader actions" },
  });
  action(bar, "arrow-left", "Back to outputs", "Back", actions.onBack);
  action(bar, "chevron-up", "Previous output", "Previous", actions.onPrevious);
  action(bar, "chevron-down", "Next output", "Next", actions.onNext);
  bar.createSpan({ cls: "hcv-reader-file", text: view.fileName });

  // Every state below stays inside the reader, so "Back to outputs" is always reachable.
  if (view.loading) {
    parent.createEl("p", { cls: "hcv-evidence-empty", text: "Loading output file" });
    return;
  }
  if (view.error !== null) {
    parent.createEl("p", { cls: "hcv-evidence-empty", text: view.error });
    return;
  }
  if (view.entry === undefined) {
    parent.createEl("p", { cls: "hcv-evidence-empty", text: NOTICES.bodyUnavailable });
    return;
  }
  if (view.entry.capExceeded) {
    parent.createEl("p", {
      cls: "hcv-evidence-empty",
      text: "Response bound reached; the safe prefix below is shown and the rest was not accepted.",
    });
  }
  // `text` sets a text node; remote content has no markup path.
  parent.createEl("pre", { cls: "hcv-verbatim", text: view.entry.body });
}

/**
 * One compact icon action with its accessible name.
 *
 * A `null` handler is an end of the file order: the button stays visible and disabled instead of
 * disappearing, and no click can trigger a fetch beyond the list.
 */
function action(
  bar: HTMLElement,
  icon: string,
  label: string,
  text: string,
  onClick: (() => void) | null,
): void {
  const button = bar.createEl("button", {
    cls: "hcv-doc-action hcv-reader-action",
    text,
    attr: { type: "button", "aria-label": label, title: label },
  });
  setIcon(button.createSpan({ cls: "hcv-reader-icon" }), icon);
  if (onClick === null) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    return;
  }
  button.addEventListener("click", onClick);
}
