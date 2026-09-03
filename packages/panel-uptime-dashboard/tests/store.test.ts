import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { initDatabase, recordCheck, getRecentChecks, getAllTargetNames } from "../src/store.js";

describe("store", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  it("creates the checks table and returns an empty history for unknown targets", () => {
    expect(getRecentChecks(db, "web1")).toEqual([]);
    expect(getAllTargetNames(db)).toEqual([]);
  });

  it("records a check and reads it back with the right shape", () => {
    recordCheck(db, "web1", { up: true, responseTimeMs: 120, statusCode: 200 });
    const rows = getRecentChecks(db, "web1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.up).toBe(true);
    expect(rows[0]?.responseTimeMs).toBe(120);
    expect(rows[0]?.statusCode).toBe(200);
    expect(rows[0]?.targetName).toBe("web1");
    expect(rows[0]?.error).toBeNull();
    expect(typeof rows[0]?.checkedAt).toBe("string");
  });

  it("records a down check with an error message and null statusCode", () => {
    recordCheck(db, "mc-server", { up: false, responseTimeMs: 5000, error: "zaman aşımı (5000ms)" });
    const rows = getRecentChecks(db, "mc-server");
    expect(rows[0]?.up).toBe(false);
    expect(rows[0]?.error).toBe("zaman aşımı (5000ms)");
    expect(rows[0]?.statusCode).toBeNull();
  });

  it("returns recent checks ordered oldest-first (most recent last)", () => {
    recordCheck(db, "web1", { up: true, responseTimeMs: 100 });
    recordCheck(db, "web1", { up: false, responseTimeMs: 0, error: "boom" });
    recordCheck(db, "web1", { up: true, responseTimeMs: 90 });

    const rows = getRecentChecks(db, "web1", 10);
    expect(rows.map((r) => r.up)).toEqual([true, false, true]);
    expect(rows[rows.length - 1]?.responseTimeMs).toBe(90);
  });

  it("respects the limit parameter and keeps the most recent N", () => {
    for (let i = 0; i < 5; i++) {
      recordCheck(db, "web1", { up: true, responseTimeMs: i });
    }
    const rows = getRecentChecks(db, "web1", 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.responseTimeMs)).toEqual([3, 4]);
  });

  it("keeps separate histories per target", () => {
    recordCheck(db, "web1", { up: true, responseTimeMs: 10 });
    recordCheck(db, "mc-server", { up: false, responseTimeMs: 0, error: "refused" });

    expect(getRecentChecks(db, "web1")).toHaveLength(1);
    expect(getRecentChecks(db, "mc-server")).toHaveLength(1);
  });

  it("lists all distinct target names alphabetically", () => {
    recordCheck(db, "web1", { up: true, responseTimeMs: 10 });
    recordCheck(db, "mc-server", { up: true, responseTimeMs: 10 });
    recordCheck(db, "web1", { up: true, responseTimeMs: 12 });

    expect(getAllTargetNames(db)).toEqual(["mc-server", "web1"]);
  });
});
