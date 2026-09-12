import { describe, expect, test } from "bun:test";
import { HERMES, JobDetailModal, PROFILE, SshReadOnlyAdapter, VerbatimMemoryStore, fakeRunner, flushClick, job, modalBags } from "./delta-fixtures";

type Bag = { texts: string[]; clicks: { text: string; handler: () => void }[] } | undefined;

/** Click a tab by its short English name; the panel is rendered only after the tab is active. */
async function openTab(bag: Bag, name: "Overview" | "History" | "Output"): Promise<void> {
  const tab = bag?.clicks.find((entry) => entry.text === name);
  expect(tab).toBeDefined();
  await flushClick(tab?.handler);
}

function modalFor(runner: ReturnType<typeof fakeRunner>["runner"], bodies = new VerbatimMemoryStore(), limit = 5) {
  return new JobDetailModal(
    {} as never,
    job(),
    PROFILE,
    new SshReadOnlyAdapter({ runner }),
    bodies,
    limit,
  );
}

describe("delta: pending reads are loading, never emptiness", () => {
  test("History and Output say they are loading until the first read returns", async () => {
    const fileName = "2026-09-12T09:00:00.md";
    const { runner } = fakeRunner([
      { match: "sqlite3", stdout: JSON.stringify([
        { id: "e2", job_id: "job-a", status: "completed", claimed_at: "2026-09-12T10:00:00+09:00" },
      ]) },
      { match: "-name '*.md'", stdout: `${HERMES}/cron/output/job-a/${fileName}\u0000` },
    ]);
    const modal = modalFor(runner);
    const opening = modal.onOpen();
    const bag = modalBags.get(modal);

    // Synchronous click: the evidence read is still in flight.
    bag?.clicks.find((entry) => entry.text === "History")?.handler();
    expect(bag?.texts).toContain("Loading history");
    expect(bag?.texts.some((text) => text.includes("Not in the current query window"))).toBe(false);

    bag?.clicks.find((entry) => entry.text === "Output")?.handler();
    expect(bag?.texts).toContain("Loading output files");
    expect(bag?.texts.some((text) => text === "No output files listed.")).toBe(false);

    await opening;
    // The in-flight completion repaints in place and never moves the tab back to Overview.
    expect(bag?.texts).toContain(fileName);
    expect(bag?.texts).not.toContain("Loading output files");
    expect(bag?.texts).not.toContain("e2");

    await openTab(bag, "History");
    expect(bag?.texts).toContain("e2");
    expect(bag?.texts).not.toContain("Loading history");
  });

  test("a read finishing after close does not repaint the closed modal", async () => {
    const { runner } = fakeRunner([
      { match: "sqlite3", stdout: "[]" },
      { match: "-name '*.md'", stdout: "" },
    ]);
    const modal = modalFor(runner);
    const opening = modal.onOpen();
    modal.onClose();
    const bag = modalBags.get(modal);
    await opening;
    expect(bag?.texts.length).toBe(0);
    expect(bag?.clicks.length).toBe(0);
  });
});

describe("delta: one panel at a time", () => {
  test("Overview opens first and the ledger/output panels are not rendered beside it", async () => {
    const { runner } = fakeRunner([
      { match: "sqlite3", stdout: JSON.stringify([
        { id: "e2", job_id: "job-a", status: "completed", claimed_at: "2026-09-12T10:00:00+09:00" },
      ]) },
      { match: "-name '*.md'", stdout: `${HERMES}/cron/output/job-a/2026-09-12T09:00:00.md\u0000` },
    ]);
    const modal = modalFor(runner);
    await modal.onOpen();
    const bag = modalBags.get(modal);

    // Overview keeps the native facts and the exact prompt/error bodies.
    expect(bag?.texts).toContain("PROMPT-MUST-STAY-IN-MEMORY");
    expect(bag?.texts).toContain("ERR-MUST-STAY-IN-MEMORY");
    expect(bag?.texts).toContain("daily");
    // No ledger row and no output file are shown at the same time as the overview.
    expect(bag?.texts).not.toContain("e2");
    expect(bag?.texts).not.toContain("2026-09-12T09:00:00.md");

    await openTab(bag, "History");
    expect(bag?.texts).toContain("e2");
    expect(bag?.texts).not.toContain("2026-09-12T09:00:00.md");

    await openTab(bag, "Output");
    expect(bag?.texts).toContain("2026-09-12T09:00:00.md");
    expect(bag?.texts).not.toContain("e2");
  });

  test("arrow keys move between tabs and the selected output survives tab switches", async () => {
    const fileName = "2026-09-12T09:00:00.md";
    const { runner } = fakeRunner([
      { match: "sqlite3", stdout: "[]" },
      { match: "-name '*.md'", stdout: `${HERMES}/cron/output/job-a/${fileName}\u0000` },
      { match: "head -c", stdout: "OUTPUT-BODY-EXACT" },
    ]);
    const modal = modalFor(runner);
    await modal.onOpen();
    const bag = modalBags.get(modal);

    // Keyboard: the second handler of a tab button is its keydown handler.
    const overviewHandlers = bag?.clicks.filter((entry) => entry.text === "Overview") ?? [];
    expect(overviewHandlers.length).toBe(2);
    const keydown = overviewHandlers[1]?.handler as unknown as (event: KeyboardEvent) => void;
    keydown({ key: "End", preventDefault() {} } as KeyboardEvent);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bag?.texts).toContain(fileName);

    await flushClick(bag?.clicks.find((entry) => entry.text === fileName)?.handler);
    expect(bag?.texts).toContain("OUTPUT-BODY-EXACT");

    await openTab(bag, "History");
    expect(bag?.texts).not.toContain("OUTPUT-BODY-EXACT");
    await openTab(bag, "Output");
    // The selection and its cached body are kept; nothing is refetched automatically.
    expect(bag?.texts).toContain("OUTPUT-BODY-EXACT");
  });
});

describe("delta: R5/R6 non-zero exits are reported, not empty success", () => {
  test("a failed output listing is not rendered as no files", async () => {
    const { runner } = fakeRunner([
      { match: "sqlite3", stdout: "[]" },
      { match: "-name '*.md'", stderr: "find: permission denied", exitCode: 1 },
    ]);
    const modal = modalFor(runner);
    await modal.onOpen();
    const bag = modalBags.get(modal);
    await openTab(bag, "Output");
    expect(bag?.texts.some((text) => text.includes("Could not list output files"))).toBe(true);
    expect(bag?.texts.some((text) => text.includes("find: permission denied"))).toBe(true);
    expect(bag?.texts.some((text) => text === "No output files listed.")).toBe(false);
  });

  test("a failed output body read is reported and not cached as empty", async () => {
    const fileName = "2026-09-12T09:00:00.md";
    const { runner } = fakeRunner([
      { match: "sqlite3", stdout: "[]" },
      {
        match: "-name '*.md'",
        stdout: `${HERMES}/cron/output/job-a/${fileName}\u0000`,
      },
      { match: "head -c", stderr: "Permission denied", exitCode: 1 },
    ]);
    const bodies = new VerbatimMemoryStore();
    const modal = modalFor(runner, bodies);
    await modal.onOpen();
    const bag = modalBags.get(modal);
    await openTab(bag, "Output");
    const click = bag?.clicks.find((entry) => entry.text === fileName);
    expect(click).toBeDefined();
    await flushClick(click?.handler);
    const key = `m1-file\u0000default\u0000job-a\u0000${fileName}`;
    expect(bodies.has(key)).toBe(false);
    expect(bag?.texts.some((text) => text.includes("Permission denied"))).toBe(true);
  });
});

describe("delta: keyset pagination is wired", () => {
  test("Load older rows issues a keyset query and concatenates pages", async () => {
    const page1 = JSON.stringify([
      { id: "e2", job_id: "job-a", status: "completed", claimed_at: "2026-09-12T10:00:00+09:00" },
    ]);
    const page2 = JSON.stringify([
      { id: "e1", job_id: "job-a", status: "completed", claimed_at: "2026-09-12T09:00:00+09:00" },
    ]);
    const { runner, log } = fakeRunner([
      { match: "(claimed_at, id)", stdout: page2 },
      { match: "sqlite3", stdout: page1 },
      { match: "-name '*.md'", stdout: "" },
    ]);
    const modal = modalFor(runner, new VerbatimMemoryStore(), 1);
    await modal.onOpen();
    const bag = modalBags.get(modal);
    await openTab(bag, "History");
    expect(bag?.texts).toContain("e2");
    const more = bag?.clicks.find((entry) => entry.text === "Load older rows");
    expect(more).toBeDefined();
    await flushClick(more?.handler);
    expect(bag?.texts).toContain("e2");
    expect(bag?.texts).toContain("e1");
    const sql = log.map((entry) => entry.args[entry.args.length - 1] ?? "");
    expect(sql.some((command) => command.includes("(claimed_at, id) <"))).toBe(true);
    expect(sql.every((command) => !command.includes("hermes cron"))).toBe(true);
  });

  test("a failed older page keeps loaded rows and reports the cause", async () => {
    const page1 = JSON.stringify([
      { id: "e2", job_id: "job-a", status: "completed", claimed_at: "2026-09-12T10:00:00+09:00" },
    ]);
    const { runner } = fakeRunner([
      { match: "(claimed_at, id)", stderr: "unable to open database file", exitCode: 1 },
      { match: "sqlite3", stdout: page1 },
      { match: "-name '*.md'", stdout: "" },
    ]);
    const modal = modalFor(runner, new VerbatimMemoryStore(), 1);
    await modal.onOpen();
    const bag = modalBags.get(modal);
    await openTab(bag, "History");
    await flushClick(bag?.clicks.find((entry) => entry.text === "Load older rows")?.handler);
    expect(bag?.texts).toContain("e2");
    expect(bag?.texts.some((text) => text.includes("Older rows could not be loaded"))).toBe(true);
    expect(bag?.texts.some((text) => text.includes("unable to open database file"))).toBe(true);
    expect(bag?.texts).toContain("Retry older rows");
  });
});

const OLDER = "2026-09-12T09:00:00.md";
const NEWER = "2026-09-12T10:00:00.md";
const LISTING = `${HERMES}/cron/output/job-a/${OLDER}\u0000${HERMES}/cron/output/job-a/${NEWER}\u0000`;
const NOTE = "Hermes stores no link between a ledger row and an output file, so these are not paired.";

/** Two readable output files, newest first in the index order. */
function twoFiles(overrides: readonly { match: string; stdout?: string; stderr?: string; exitCode?: number }[] = []) {
  return fakeRunner([
    ...overrides,
    { match: OLDER, stdout: "BODY-OLDER" },
    { match: NEWER, stdout: "BODY-NEWER" },
    { match: "sqlite3", stdout: "[]" },
    { match: "-name '*.md'", stdout: LISTING },
  ]);
}

async function openOutputTab(runner: ReturnType<typeof fakeRunner>["runner"], bodies = new VerbatimMemoryStore()) {
  const modal = modalFor(runner, bodies);
  await modal.onOpen();
  const bag = modalBags.get(modal);
  await openTab(bag, "Output");
  return bag;
}

describe("delta: one output is read in one place", () => {
  test("selecting a file replaces the list, and Back restores it", async () => {
    const { runner } = twoFiles();
    const bag = await openOutputTab(runner);
    expect(bag?.texts).toContain(OLDER);
    expect(bag?.texts).toContain(NEWER);

    await flushClick(bag?.clicks.find((entry) => entry.text === OLDER)?.handler);
    // The reader stands alone: no second copy of the list and no listing note above the body.
    expect(bag?.texts).toContain("BODY-OLDER");
    expect(bag?.texts).toContain(OLDER);
    expect(bag?.texts).not.toContain(NEWER);
    expect(bag?.texts).not.toContain(NOTE);

    await flushClick(bag?.clicks.find((entry) => entry.text === "Back")?.handler);
    expect(bag?.texts).toContain(NOTE);
    expect(bag?.texts).toContain(NEWER);
    expect(bag?.texts).not.toContain("BODY-OLDER");
  });

  test("adjacent navigation follows the index order and is disabled at both ends", async () => {
    const { runner } = twoFiles();
    const bag = await openOutputTab(runner);

    // The newest file is first in the index, so there is nothing before it.
    await flushClick(bag?.clicks.find((entry) => entry.text === NEWER)?.handler);
    expect(bag?.texts).toContain("BODY-NEWER");
    expect(bag?.clicks.some((entry) => entry.text === "Previous")).toBe(false);

    await flushClick(bag?.clicks.find((entry) => entry.text === "Next")?.handler);
    expect(bag?.texts).toContain("BODY-OLDER");
    expect(bag?.texts).not.toContain("BODY-NEWER");
    // The oldest file is last, so only the backwards step remains.
    expect(bag?.clicks.some((entry) => entry.text === "Next")).toBe(false);

    await flushClick(bag?.clicks.find((entry) => entry.text === "Previous")?.handler);
    expect(bag?.texts).toContain("BODY-NEWER");
  });

  test("a failed read stays in the reader, is not cached, and is retried on demand", async () => {
    const { runner, log } = twoFiles([{ match: OLDER, stderr: "READ-DENIED", exitCode: 1 }]);
    const bodies = new VerbatimMemoryStore();
    const bag = await openOutputTab(runner, bodies);

    await flushClick(bag?.clicks.find((entry) => entry.text === OLDER)?.handler);
    expect(bag?.texts.some((text) => text.includes("READ-DENIED"))).toBe(true);
    expect(bodies.has(`m1-file\u0000default\u0000job-a\u0000${OLDER}`)).toBe(false);
    // Back out of a failure is always possible.
    expect(bag?.clicks.some((entry) => entry.text === "Back")).toBe(true);

    await flushClick(bag?.clicks.find((entry) => entry.text === "Back")?.handler);
    await flushClick(bag?.clicks.find((entry) => entry.text === OLDER)?.handler);
    const reads = log.filter((entry) => (entry.args[entry.args.length - 1] ?? "").includes(OLDER));
    expect(reads).toHaveLength(2);
    expect(bag?.texts.some((text) => text.includes("READ-DENIED"))).toBe(true);
  });

  test("a late reply for an abandoned file cannot overwrite the current state", async () => {
    const { runner } = twoFiles([{ match: OLDER, stderr: "STALE-FAILURE", exitCode: 1 }]);
    const bag = await openOutputTab(runner);

    // Start the read, then leave the reader before the reply arrives.
    bag?.clicks.find((entry) => entry.text === OLDER)?.handler();
    expect(bag?.texts).toContain("Loading output file");
    bag?.clicks.find((entry) => entry.text === "Back")?.handler();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(bag?.texts).toContain(NOTE);
    expect(bag?.texts.some((text) => text.includes("STALE-FAILURE"))).toBe(false);
  });
});

describe("delta: an unreadable history says only what was observed", () => {
  test("the pane is a short statement plus the exact native message behind a disclosure", async () => {
    const { runner } = fakeRunner([
      { match: "sqlite3", stderr: "Error: unable to open database file", exitCode: 1 },
      { match: "-name '*.md'", stdout: "" },
    ]);
    const modal = modalFor(runner);
    await modal.onOpen();
    const bag = modalBags.get(modal);
    await openTab(bag, "History");

    expect(bag?.texts).toContain("History unavailable");
    expect(bag?.texts).toContain(
      "The execution log could not be read. Schedules and output files are still available.",
    );
    expect(bag?.texts).toContain("Technical details");
    // The native message is kept verbatim, and no cause is asserted from a failed read alone.
    expect(bag?.texts.some((text) => text.includes("unable to open database file"))).toBe(true);
    const claims = ["corrupt", "WAL", "missing", "deleted"];
    expect(bag?.texts.some((text) => claims.some((word) => text.includes(word)))).toBe(false);
  });
});
