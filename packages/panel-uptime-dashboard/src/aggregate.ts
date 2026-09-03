/**
 * Pure aggregation over check history. No I/O here — everything operates on
 * plain arrays so it's trivially unit-testable.
 *
 * Ordering convention: callers pass checks ordered oldest-first, most-recent-last
 * (this matches store.ts's getRecentChecks output).
 */

export interface CheckRecord {
  up: boolean;
  responseTimeMs?: number | null;
  checkedAt?: string;
}

/** Percent of checks where `up` is true, 0-100. Returns `null` for an empty array (no data yet). */
export function uptimePercent(checks: CheckRecord[]): number | null {
  if (checks.length === 0) return null;
  const upCount = checks.filter((c) => c.up).length;
  return (upCount / checks.length) * 100;
}

/** Status derived from the most recent (last) entry. "unknown" when there's no history. */
export function currentStatus(checks: CheckRecord[]): "up" | "down" | "unknown" {
  if (checks.length === 0) return "unknown";
  const last = checks[checks.length - 1];
  if (!last) return "unknown";
  return last.up ? "up" : "down";
}

// Down checks always render as this marker, distinct from any "up" response-time bucket.
const DOWN_CHAR = "_";

// Response-time buckets for "up" checks, lowest (fastest) to highest (slowest).
const SPARK_LEVELS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function levelChar(idx: number): string {
  return SPARK_LEVELS[idx] ?? SPARK_LEVELS[SPARK_LEVELS.length - 1] ?? DOWN_CHAR;
}

/**
 * Renders a compact one-character-per-check sparkline for the most recent `width`
 * checks (default 20), most-recent last. Down checks render as `_`; up checks render
 * as a block character scaled by response time relative to the min/max seen in the
 * window (fastest = shortest bar, slowest = tallest bar). Deterministic for a given input.
 */
export function sparkline(checks: CheckRecord[], width = 20): string {
  if (checks.length === 0) return "";

  const windowed = checks.slice(-width);
  const responseTimes = windowed
    .filter((c): c is CheckRecord & { responseTimeMs: number } => c.up && typeof c.responseTimeMs === "number")
    .map((c) => c.responseTimeMs);

  const min = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
  const max = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
  const range = max - min;

  return windowed
    .map((check) => {
      if (!check.up) return DOWN_CHAR;
      const rt = typeof check.responseTimeMs === "number" ? check.responseTimeMs : min;
      if (range === 0) return levelChar(SPARK_LEVELS.length - 1);
      const ratio = (rt - min) / range;
      const idx = Math.min(SPARK_LEVELS.length - 1, Math.floor(ratio * SPARK_LEVELS.length));
      return levelChar(idx);
    })
    .join("");
}
