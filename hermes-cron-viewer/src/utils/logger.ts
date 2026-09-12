import type { LogLevel } from "../types/contracts";
import type { RoundCounters } from "../types/view";


export function emptyCounters(): RoundCounters {
  return {
    sources: 0,
    commands: 0,
    durationMs: 0,
    parseFailures: 0,
    timezoneUnknown: 0,
    ledgerUnavailable: 0,
    capExceeded: 0,
    rejectedCommands: 0,
  };
}

/**
 * Structured logger for the plugin.
 *
 * Callers pass identifiers, counts and classifications only. Prompts, replies, error bodies and
 * file contents must never reach this surface.
 */
export class Logger {
  constructor(private readonly prefix = "HermesCronViewer") {}

  private emit(level: LogLevel, message: string, fields: Record<string, string | number | boolean>): void {
    const rendered = Object.entries(fields)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(" ");
    const line = `[${this.prefix}] ${level} | ${message}${rendered === "" ? "" : ` | ${rendered}`}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  info(message: string, fields: Record<string, string | number | boolean> = {}): void {
    this.emit("info", message, fields);
  }

  warn(message: string, fields: Record<string, string | number | boolean> = {}): void {
    this.emit("warn", message, fields);
  }

  error(message: string, fields: Record<string, string | number | boolean> = {}): void {
    this.emit("error", message, fields);
  }

  round(counters: RoundCounters): void {
    this.info("collection round", { ...counters });
  }
}
