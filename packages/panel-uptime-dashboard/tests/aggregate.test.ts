import { describe, it, expect } from "vitest";
import {
  uptimePercent,
  sparkline,
  currentStatus,
  incidentHistory,
  type CheckRecord,
  type TimestampedCheckRecord,
} from "../src/aggregate.js";

const up = (responseTimeMs: number): CheckRecord => ({ up: true, responseTimeMs });
const down = (): CheckRecord => ({ up: false });

// Fixed base instant + a minute-per-check helper so incident tests get real,
// strictly increasing timestamps without hardcoding ISO strings everywhere.
const BASE_MS = Date.parse("2026-01-01T00:00:00.000Z");
const at = (minutesFromBase: number): string => new Date(BASE_MS + minutesFromBase * 60_000).toISOString();

const upAt = (minutesFromBase: number): TimestampedCheckRecord => ({ up: true, checkedAt: at(minutesFromBase) });
const downAt = (minutesFromBase: number): TimestampedCheckRecord => ({ up: false, checkedAt: at(minutesFromBase) });

describe("uptimePercent", () => {
  it("returns null for an empty array", () => {
    expect(uptimePercent([])).toBeNull();
  });

  it("returns 100 when all checks are up", () => {
    expect(uptimePercent([up(10), up(20), up(30)])).toBe(100);
  });

  it("returns 0 when all checks are down", () => {
    expect(uptimePercent([down(), down()])).toBe(0);
  });

  it("returns the correct percentage for a mixed history", () => {
    expect(uptimePercent([up(10), down(), up(20), down()])).toBe(50);
  });
});

describe("currentStatus", () => {
  it("returns unknown for an empty array", () => {
    expect(currentStatus([])).toBe("unknown");
  });

  it("returns up when the most recent (last) check is up", () => {
    expect(currentStatus([down(), up(10)])).toBe("up");
  });

  it("returns down when the most recent (last) check is down", () => {
    expect(currentStatus([up(10), down()])).toBe("down");
  });
});

describe("sparkline", () => {
  it("returns an empty string for no history", () => {
    expect(sparkline([])).toBe("");
  });

  it("produces one character per check, capped at width", () => {
    const checks = Array.from({ length: 5 }, (_, i) => up(i * 10));
    expect(sparkline(checks, 3)).toHaveLength(3);
    expect(sparkline(checks, 10)).toHaveLength(5);
  });

  it("keeps only the most recent `width` checks (trailing window)", () => {
    const checks = [up(1), up(2), up(3), up(4), up(5)];
    // sparkline(checks, 3) windows down to the same 3 trailing entries that
    // checks.slice(-3) already is, so both should scale identically.
    expect(sparkline(checks, 3)).toBe(sparkline(checks.slice(-3)));
  });

  it("marks down checks with the down marker, distinct from up levels", () => {
    const result = sparkline([up(10), down(), up(20)]);
    expect(result[1]).toBe("_");
    expect(result[0]).not.toBe("_");
    expect(result[2]).not.toBe("_");
  });

  it("is deterministic for the same input", () => {
    const checks = [up(5), up(50), down(), up(25)];
    expect(sparkline(checks)).toBe(sparkline(checks));
  });

  it("gives the fastest and slowest checks distinct extreme levels", () => {
    const checks = [up(0), up(100)];
    const result = sparkline(checks);
    expect(result[0]).toBe("▁");
    expect(result[1]).toBe("█");
  });

  it("renders the tallest bar for up checks with no responseTimeMs at all", () => {
    // No entry has a numeric responseTimeMs, so min/max/range are all 0 and
    // every up check falls into the range===0 branch (tallest bar), never "_".
    const checks: CheckRecord[] = [{ up: true }, { up: true, responseTimeMs: null }];
    const result = sparkline(checks);
    expect(result).toBe("██");
  });

  it("falls back missing responseTimeMs to the window minimum when other checks have data", () => {
    // Documents current behavior: an up check with no responseTimeMs is
    // treated as tying the fastest response in the window, not as "unknown".
    const checks: CheckRecord[] = [up(0), { up: true }, up(100)];
    const result = sparkline(checks);
    expect(result[0]).toBe("▁");
    expect(result[1]).toBe("▁");
    expect(result[2]).toBe("█");
  });
});

describe("incidentHistory", () => {
  it("returns an empty array for an empty history", () => {
    expect(incidentHistory([])).toEqual([]);
  });

  it("returns no incidents when every check is up", () => {
    expect(incidentHistory([upAt(0), upAt(1), upAt(2)])).toEqual([]);
  });

  it("treats a single down check as one ongoing incident", () => {
    const incidents = incidentHistory([downAt(0)]);
    expect(incidents).toEqual([{ startedAt: at(0), endedAt: null, durationMs: null, downChecks: 1 }]);
  });

  it("treats a single up check as no incidents", () => {
    expect(incidentHistory([upAt(0)])).toEqual([]);
  });

  it("closes an incident at the recovery (first up) check and reports its duration", () => {
    const incidents = incidentHistory([upAt(0), downAt(1), downAt(2), downAt(3), upAt(4)]);
    expect(incidents).toEqual([
      { startedAt: at(1), endedAt: at(4), durationMs: 3 * 60_000, downChecks: 3 },
    ]);
  });

  it("treats an entire all-down history as one ongoing incident starting at the first check", () => {
    const incidents = incidentHistory([downAt(0), downAt(1), downAt(2)]);
    expect(incidents).toEqual([{ startedAt: at(0), endedAt: null, durationMs: null, downChecks: 3 }]);
  });

  it("reports an incident still open at the end of history as ongoing (endedAt/durationMs null)", () => {
    const incidents = incidentHistory([upAt(0), downAt(1), downAt(2)]);
    expect(incidents).toEqual([{ startedAt: at(1), endedAt: null, durationMs: null, downChecks: 2 }]);
  });

  it("splits two down runs separated by an up check into two discrete, non-overlapping incidents", () => {
    const incidents = incidentHistory([downAt(0), upAt(1), downAt(2), downAt(3), upAt(4)]);
    expect(incidents).toHaveLength(2);
    expect(incidents[0]).toEqual({ startedAt: at(0), endedAt: at(1), durationMs: 60_000, downChecks: 1 });
    expect(incidents[1]).toEqual({ startedAt: at(2), endedAt: at(4), durationMs: 2 * 60_000, downChecks: 2 });
  });

  it("merges adjacent down checks (no up check between them) into a single incident, never double-counting", () => {
    // Two separate down "runs" with nothing but more down checks between them must
    // collapse into one incident, not one-per-down-check.
    const incidents = incidentHistory([downAt(0), downAt(1), downAt(2), downAt(3)]);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.downChecks).toBe(4);
  });

  it("returns incidents oldest-first, matching the input ordering convention", () => {
    const incidents = incidentHistory([downAt(0), upAt(1), downAt(2), upAt(3), downAt(4), upAt(5)]);
    expect(incidents.map((incident) => incident.startedAt)).toEqual([at(0), at(2), at(4)]);
  });
});
