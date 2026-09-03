import type { DatabaseSync } from "node:sqlite";
import type { Target } from "./config.js";
import { runCheck, type CheckResult } from "./checker.js";
import { recordCheck } from "./store.js";

export type CheckLogger = (target: Target, result: CheckResult) => void;

/**
 * Runs a check against every target once and records each result. Exposed
 * separately from `startMonitoring` so tests can invoke a single monitoring
 * pass directly instead of waiting on real intervals.
 */
export async function checkAllTargets(db: DatabaseSync, targets: Target[], onResult?: CheckLogger): Promise<void> {
  await Promise.all(
    targets.map(async (target) => {
      const result = await runCheck(target);
      recordCheck(db, target.name, result);
      onResult?.(target, result);
    }),
  );
}

/**
 * Starts the recurring check loop: runs once immediately, then every `intervalMs`.
 * Returns a function that stops the loop (clears the interval).
 */
export function startMonitoring(
  db: DatabaseSync,
  targets: Target[],
  intervalMs: number,
  onResult?: CheckLogger,
): () => void {
  void checkAllTargets(db, targets, onResult);

  const timer = setInterval(() => {
    void checkAllTargets(db, targets, onResult);
  }, intervalMs);

  return () => clearInterval(timer);
}
