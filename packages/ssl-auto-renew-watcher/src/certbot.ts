import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCb);

/**
 * Shape of a process-executing function: given a command and argv, resolves
 * with captured stdout/stderr or rejects (mirroring promisified
 * `execFile`). Accepting this as a parameter (defaulting to the real
 * `execFile`) lets tests inject a fake instead of spawning a real process.
 */
export type ExecFn = (
  command: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>;

const defaultExecFn: ExecFn = (command, args) => execFileAsync(command, args);

/**
 * Checks whether a `certbot` binary is reachable on PATH by invoking
 * `certbot --version` and treating success as availability.
 */
export async function isCertbotAvailable(execFn: ExecFn = defaultExecFn): Promise<boolean> {
  try {
    await execFn("certbot", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export interface RunCertbotRenewOptions {
  /** Only when this is exactly `true` does a real renewal run. Defaults to a dry run. */
  execute?: boolean;
  execFn?: ExecFn;
}

export interface RunCertbotRenewResult {
  ranCommand: string;
  dryRun: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Runs `certbot renew`. Safe by default: unless `opts.execute === true`,
 * this always runs with `--dry-run`, so it can never mutate real
 * certificates unless the caller opts in explicitly.
 */
export async function runCertbotRenew(
  opts: RunCertbotRenewOptions = {}
): Promise<RunCertbotRenewResult> {
  const dryRun = opts.execute !== true;
  const args = dryRun ? ["renew", "--dry-run"] : ["renew"];
  const ranCommand = `certbot ${args.join(" ")}`;
  const execFn = opts.execFn ?? defaultExecFn;

  try {
    const { stdout, stderr } = await execFn("certbot", args);
    return { ranCommand, dryRun, stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      ranCommand,
      dryRun,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? String(err),
      exitCode: typeof e.code === "number" ? e.code : 1,
    };
  }
}

export interface CertbotParseResult {
  succeeded: string[];
  failed: string[];
  skipped: string[];
}

/**
 * Pulls a cert lineage name (e.g. "example.com") out of a certbot output
 * line such as "  /etc/letsencrypt/live/example.com/fullchain.pem
 * (success)" or "... expires on 2026-11-01 (skipped)". Falls back to the
 * trimmed line (with any trailing "(success|failure|skipped)" marker
 * stripped) when no `/live/<name>/` path segment is present.
 */
function extractLineageName(line: string): string {
  const liveMatch = line.match(/\/live\/([^/]+)\//);
  const lineageFromPath = liveMatch?.[1];
  if (lineageFromPath) return lineageFromPath;
  return line.trim().replace(/\s*\((success|failure|skipped)\)\s*$/i, "");
}

/**
 * Collects the indented lines that make up a certbot output section
 * (e.g. the list under "The following certs have been renewed:"),
 * stopping at the first blank line or line that isn't indented.
 */
function collectIndentedSection(lines: string[], startIndex: number): string[] {
  const entries: string[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") break;
    if (!/^\s+/.test(line)) break;
    entries.push(extractLineageName(line));
    i++;
  }
  return entries;
}

/**
 * Parses certbot's real `renew` output format into lineage names grouped by
 * outcome. Recognizes the well-known section headers certbot prints:
 *  - "The following certs have been renewed:" (also appears after the
 *    "Congratulations, all renewals succeeded" summary line)
 *  - "The following certs could not be renewed:" (also appears after the
 *    "All renewal attempts failed" summary line)
 *  - "The following certs are not due for renewal yet:"
 */
export function parseCertbotOutput(stdout: string): CertbotParseResult {
  const lines = stdout.split(/\r?\n/);
  const succeeded: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (/The following certs have been renewed:/i.test(line)) {
      succeeded.push(...collectIndentedSection(lines, i + 1));
    } else if (/The following certs could not be renewed:/i.test(line)) {
      failed.push(...collectIndentedSection(lines, i + 1));
    } else if (/The following certs are not due for renewal yet:/i.test(line)) {
      skipped.push(...collectIndentedSection(lines, i + 1));
    }
  }

  return { succeeded, failed, skipped };
}
