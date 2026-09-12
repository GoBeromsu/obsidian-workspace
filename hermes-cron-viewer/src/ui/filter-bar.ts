import { setIcon } from "obsidian";
import type { ViewerState } from "./viewer-state";

/**
 * Caret memory per view container.
 *
 * Every filter change re-renders the whole view, which replaces the search input. Remembering the
 * caret while the input is focused lets the fresh input take focus back at the same position, so
 * typing is not interrupted. `blur` clears it, so focus is never stolen from another control.
 */
const SEARCH_CARET = new WeakMap<HTMLElement, { start: number; end: number }>();

function rememberCaret(owner: HTMLElement, input: HTMLInputElement): void {
  SEARCH_CARET.set(owner, {
    start: input.selectionStart ?? input.value.length,
    end: input.selectionEnd ?? input.value.length,
  });
}

function restoreCaret(owner: HTMLElement, input: HTMLInputElement): void {
  const caret = SEARCH_CARET.get(owner);
  if (caret === undefined) return;
  input.focus();
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(Math.min(caret.start, input.value.length), Math.min(caret.end, input.value.length));
  }
}

/** Server / profile / text filters plus a manual refresh control. */
export function renderFilterBar(parent: HTMLElement, state: ViewerState): void {
  const bar = parent.createDiv({ cls: "hcv-filter-bar" });
  const sourceRow = bar.createDiv({ cls: "hcv-filter-row hcv-filter-sources" });
  const actionRow = bar.createDiv({ cls: "hcv-filter-row hcv-filter-actions" });
  const filter = state.getFilter();
  const snapshots = state.getSnapshots();

  const aliases = [...new Set(snapshots.map((snapshot) => snapshot.source.alias))].sort();
  const profileValues = [
    ...new Set(
      snapshots
        .filter((snapshot) => filter.alias === null || snapshot.source.alias === filter.alias)
        .map((snapshot) => snapshot.source.profileId),
    ),
  ].sort();

  const serverSelect = sourceRow.createEl("select", {
    cls: "dropdown hcv-filter-select",
    attr: { "aria-label": "Server filter" },
  });
  serverSelect.createEl("option", { text: "All servers", value: "" });
  for (const alias of aliases) {
    const option = serverSelect.createEl("option", { text: alias, value: alias });
    if (filter.alias === alias) option.selected = true;
  }
  serverSelect.addEventListener("change", () => {
    const value = serverSelect.value;
    state.setFilter({ ...state.getFilter(), alias: value === "" ? null : value });
  });

  const profileSelect = sourceRow.createEl("select", {
    cls: "dropdown hcv-filter-select",
    attr: { "aria-label": "Profile filter" },
  });
  profileSelect.createEl("option", { text: "All profiles", value: "" });
  for (const value of profileValues) {
    const option = profileSelect.createEl("option", { text: value, value });
    if (filter.profileId === value) option.selected = true;
  }
  profileSelect.addEventListener("change", () => {
    const value = profileSelect.value;
    state.setFilter({ ...state.getFilter(), profileId: value === "" ? null : value });
  });

  const searchControl = actionRow.createDiv({ cls: "hcv-search-control" });
  const searchIcon = searchControl.createSpan({ cls: "hcv-search-icon" });
  searchIcon.setAttribute("aria-hidden", "true");
  setIcon(searchIcon, "search");
  const search = searchControl.createEl("input", {
    cls: "hcv-filter-search",
    attr: { type: "search", placeholder: "Search jobs", "aria-label": "Search jobs" },
  });
  search.value = filter.text;
  search.addEventListener("focus", () => rememberCaret(parent, search));
  search.addEventListener("blur", () => SEARCH_CARET.delete(parent));
  search.addEventListener("keyup", () => rememberCaret(parent, search));
  search.addEventListener("input", () => {
    rememberCaret(parent, search);
    state.setFilter({ ...state.getFilter(), text: search.value });
  });
  restoreCaret(parent, search);

  const actions = actionRow.createDiv({
    cls: "hcv-filter-action-group",
    attr: { "aria-label": "Filter actions" },
  });
  // The clear action exists only while there is something to clear.
  if (filter.text.length > 0) {
    const clear = actions.createEl("button", {
      cls: "clickable-icon hcv-filter-action",
      attr: {
        type: "button",
        "aria-label": "Clear search",
        title: "Clear search",
      },
    });
    setIcon(clear, "x");
    clear.addEventListener("click", () => {
      // Clearing restores the full list and hands focus back to an empty input.
      SEARCH_CARET.set(parent, { start: 0, end: 0 });
      state.setFilter({ ...state.getFilter(), text: "" });
    });
  }

  const refreshLabel = state.isRefreshing() ? "Refreshing" : "Refresh now";
  const refresh = actions.createEl("button", {
    cls: "clickable-icon hcv-filter-action hcv-refresh",
    attr: {
      type: "button",
      "aria-label": refreshLabel,
      "aria-busy": String(state.isRefreshing()),
      title: refreshLabel,
    },
  });
  setIcon(refresh, state.isRefreshing() ? "loader" : "refresh-cw");
  refresh.disabled = state.isRefreshing();
  refresh.addEventListener("click", () => {
    void state.refresh();
  });
}

