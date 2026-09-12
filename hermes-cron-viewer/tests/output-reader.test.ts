import { describe, expect, test } from "bun:test";
import { HERMES, JobDetailModal, PROFILE, SshReadOnlyAdapter, VerbatimMemoryStore, fakeRunner, flushClick, job, modalBags } from "./delta-fixtures";

type Bag = { texts: string[]; clicks: { text: string; handler: () => void }[] } | undefined;

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
  const modal = new JobDetailModal({} as never, job(), PROFILE, new SshReadOnlyAdapter({ runner }), bodies, 5);
  await modal.onOpen();
  const bag: Bag = modalBags.get(modal);
  const tab = bag?.clicks.find((entry) => entry.text === "Output");
  expect(tab).toBeDefined();
  await flushClick(tab?.handler);
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
