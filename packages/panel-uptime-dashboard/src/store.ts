import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CheckResult } from "./checker.js";

export interface CheckRow {
  id: number;
  targetName: string;
  checkedAt: string;
  up: boolean;
  responseTimeMs: number | null;
  statusCode: number | null;
  error: string | null;
}

interface DbCheckRow {
  id: number;
  target_name: string;
  checked_at: string;
  up: number;
  response_time_ms: number | null;
  status_code: number | null;
  error: string | null;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_name TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    up INTEGER NOT NULL,
    response_time_ms INTEGER,
    status_code INTEGER,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_checks_target_time
    ON checks (target_name, checked_at);
`;

/** Opens (creating if needed) the SQLite store at `dbPath` and ensures the schema exists. Use ":memory:" for tests. */
export function initDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec(SCHEMA);
  return db;
}

/** Persists one check result for `targetName`, timestamped now (UTC ISO string). */
export function recordCheck(db: DatabaseSync, targetName: string, result: CheckResult): void {
  const stmt = db.prepare(
    `INSERT INTO checks (target_name, checked_at, up, response_time_ms, status_code, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  stmt.run(
    targetName,
    new Date().toISOString(),
    result.up ? 1 : 0,
    result.responseTimeMs ?? null,
    result.statusCode ?? null,
    result.error ?? null,
  );
}

/** Returns up to `limit` most recent checks for `targetName`, ordered oldest-first (most-recent-last). */
export function getRecentChecks(db: DatabaseSync, targetName: string, limit = 20): CheckRow[] {
  const stmt = db.prepare(
    `SELECT id, target_name, checked_at, up, response_time_ms, status_code, error
     FROM checks
     WHERE target_name = ?
     ORDER BY id DESC
     LIMIT ?`,
  );
  const rows = stmt.all(targetName, limit) as unknown as DbCheckRow[];
  return rows
    .map(
      (row): CheckRow => ({
        id: row.id,
        targetName: row.target_name,
        checkedAt: row.checked_at,
        up: row.up === 1,
        responseTimeMs: row.response_time_ms,
        statusCode: row.status_code,
        error: row.error,
      }),
    )
    .reverse();
}

/** Distinct target names that have at least one recorded check, alphabetically sorted. */
export function getAllTargetNames(db: DatabaseSync): string[] {
  const stmt = db.prepare(`SELECT DISTINCT target_name FROM checks ORDER BY target_name ASC`);
  const rows = stmt.all() as Array<{ target_name: string }>;
  return rows.map((row) => row.target_name);
}
