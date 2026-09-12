/** How a status counts toward run tallies. `unknown` is never a failure. */
export type Tally = "success" | "failure" | "neither";

export interface StatusCell {
  readonly label: string;
  readonly tally: Tally;
  /** Verbatim native value when this build does not interpret the token. */
  readonly raw: string | null;
}

/** Job-level view: the newest information Hermes holds for the job as a whole. */
export interface JobStatusView {
  readonly execution: StatusCell;
  readonly delivery: StatusCell;
}

/** Ledger-row view: evidence for one individual execution, isolated to that row. */
export interface ExecutionStatusView {
  readonly execution: StatusCell;
  readonly delivery: StatusCell;
}

export interface RunTally {
  readonly success: number;
  readonly failure: number;
  readonly neither: number;
}
