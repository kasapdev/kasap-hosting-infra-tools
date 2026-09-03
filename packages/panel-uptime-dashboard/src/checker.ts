import { connect as netConnect, type Socket } from "node:net";
import type { Target } from "./config.js";

export interface CheckResult {
  up: boolean;
  statusCode?: number;
  responseTimeMs: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

/** Matches the global `fetch` signature so tests can inject a mock instead of stubbing globals. */
export type FetchLike = typeof fetch;

/** Matches `node:net`'s `connect` signature so tests can inject a mock instead of mocking the module. */
export type ConnectLike = typeof netConnect;

/**
 * Performs a real HTTP GET against `url` with an abort-based timeout.
 * 2xx and 3xx responses are treated as "up"; everything else (4xx/5xx,
 * network errors, timeouts) is "down".
 */
export async function checkHttp(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  fetchImpl: FetchLike = fetch,
): Promise<CheckResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { method: "GET", signal: controller.signal });
    const responseTimeMs = Date.now() - start;
    const up = response.status >= 200 && response.status < 400;
    return { up, statusCode: response.status, responseTimeMs };
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    const isAbort = err instanceof Error && err.name === "AbortError";
    const message = err instanceof Error ? err.message : String(err);
    return {
      up: false,
      responseTimeMs,
      error: isAbort ? `zaman aşımı (${timeoutMs}ms)` : message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempts a real TCP connect to `host:port` with a manual timeout.
 * Resolves (never rejects) with a status describing the outcome.
 */
export function checkTcp(
  host: string,
  port: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  connectImpl: ConnectLike = netConnect,
): Promise<CheckResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const socket: Socket = connectImpl({ host, port });

    const finish = (result: CheckResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ up: false, responseTimeMs: Date.now() - start, error: `zaman aşımı (${timeoutMs}ms)` });
    }, timeoutMs);

    socket.once("connect", () => {
      finish({ up: true, responseTimeMs: Date.now() - start });
    });

    socket.once("error", (err: Error) => {
      finish({ up: false, responseTimeMs: Date.now() - start, error: err.message });
    });
  });
}

/** Dispatches a target to the appropriate checker based on its `type`. */
export async function runCheck(target: Target): Promise<CheckResult> {
  const timeoutMs = target.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (target.type === "http") {
    return checkHttp(target.url, timeoutMs);
  }
  return checkTcp(target.host, target.port, timeoutMs);
}
