import { describe, it, expect } from "vitest";
import { uptimePercent, sparkline, currentStatus, type CheckRecord } from "../src/aggregate.js";

const up = (responseTimeMs: number): CheckRecord => ({ up: true, responseTimeMs });
const down = (): CheckRecord => ({ up: false });

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
