/** One account to migrate, as read from an accounts CSV/JSON file. */
export interface AccountEntry {
  username: string;
  sourceHost: string;
  destHost: string;
  homeDir: string;
  diskUsageMb: number;
  /** Username to use on the destination host, if different from `username`. */
  destUser?: string;
}

/** One ordered step of the generated migration runbook. */
export interface RunbookStep {
  /** 1-based position of this account in the migration order. */
  position: number;
  totalSteps: number;
  username: string;
  sourceHost: string;
  destHost: string;
  homeDir: string;
  diskUsageMb: number;
  /** Resolved destination username (falls back to `username`). */
  destUser: string;
  /** Real rsync syntax for a human to review and run manually. Never executed by this tool. */
  rsyncCommand: string;
  /** Fallback scp command for the packed archive. Never executed by this tool. */
  scpCommand: string;
}

const REQUIRED_CSV_COLUMNS = ["username", "sourceHost", "destHost", "homeDir", "diskUsageMb"] as const;

/**
 * Splits a single CSV line into fields, handling `"..."`-quoted fields
 * (including a literal `,` inside them) and `""`-escaped quotes inside a
 * quoted field. This is a small hand-written parser, not a general CSV
 * library — it only needs to handle the simple accounts-file shape used by
 * this tool.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i] ?? "";

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Parses accounts CSV text with a header row:
 * `username,sourceHost,destHost,homeDir,diskUsageMb[,destUser]`
 * (column order is not significant — columns are looked up by name).
 */
export function parseAccountsCsv(csvText: string): AccountEntry[] {
  const lines = csvText.split(/\r\n|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("accounts CSV is empty");
  }

  const headerLine = lines[0] ?? "";
  const header = splitCsvLine(headerLine).map((column) => column.trim());

  for (const required of REQUIRED_CSV_COLUMNS) {
    if (!header.includes(required)) {
      throw new Error(`accounts CSV is missing required column "${required}"`);
    }
  }

  const destUserIndex = header.indexOf("destUser");

  const entries: AccountEntry[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const rowNumber = lineIndex + 1; // 1-based, including the header row
    const raw = lines[lineIndex] ?? "";
    const fields = splitCsvLine(raw);

    const getField = (columnName: string): string => {
      const columnIndex = header.indexOf(columnName);
      if (columnIndex < 0) {
        return "";
      }
      return fields[columnIndex]?.trim() ?? "";
    };

    const username = getField("username");
    const sourceHost = getField("sourceHost");
    const destHost = getField("destHost");
    const homeDir = getField("homeDir");
    const diskUsageRaw = getField("diskUsageMb");

    if (!username || !sourceHost || !destHost || !homeDir) {
      throw new Error(`accounts CSV row ${rowNumber}: missing one or more required fields`);
    }

    const diskUsageMb = Number(diskUsageRaw);
    if (diskUsageRaw === "" || !Number.isFinite(diskUsageMb)) {
      throw new Error(`accounts CSV row ${rowNumber}: diskUsageMb "${diskUsageRaw}" is not a valid number`);
    }

    const destUserRaw = destUserIndex >= 0 ? (fields[destUserIndex]?.trim() ?? "") : "";

    entries.push({
      username,
      sourceHost,
      destHost,
      homeDir,
      diskUsageMb,
      ...(destUserRaw ? { destUser: destUserRaw } : {}),
    });
  }

  return entries;
}

function requireNonEmptyString(record: Record<string, unknown>, key: string, entryIndex: number): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`accounts JSON entry ${entryIndex}: field "${key}" must be a non-empty string`);
  }
  return value;
}

function validateAccountEntry(item: unknown, entryIndex: number): AccountEntry {
  if (typeof item !== "object" || item === null) {
    throw new Error(`accounts JSON entry ${entryIndex}: expected an object`);
  }
  const record = item as Record<string, unknown>;

  const username = requireNonEmptyString(record, "username", entryIndex);
  const sourceHost = requireNonEmptyString(record, "sourceHost", entryIndex);
  const destHost = requireNonEmptyString(record, "destHost", entryIndex);
  const homeDir = requireNonEmptyString(record, "homeDir", entryIndex);

  const diskUsageMb = record["diskUsageMb"];
  if (typeof diskUsageMb !== "number" || !Number.isFinite(diskUsageMb)) {
    throw new Error(`accounts JSON entry ${entryIndex}: field "diskUsageMb" must be a finite number`);
  }

  const destUserRaw = record["destUser"];
  if (destUserRaw !== undefined && typeof destUserRaw !== "string") {
    throw new Error(`accounts JSON entry ${entryIndex}: field "destUser" must be a string when present`);
  }

  return {
    username,
    sourceHost,
    destHost,
    homeDir,
    diskUsageMb,
    ...(destUserRaw ? { destUser: destUserRaw } : {}),
  };
}

/** Parses and validates a JSON array of account entries against the `AccountEntry` shape. */
export function parseAccountsJson(jsonText: string): AccountEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`accounts JSON is not valid JSON: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("accounts JSON must be a top-level array of account entries");
  }

  return parsed.map((item, index) => validateAccountEntry(item, index));
}

/**
 * Builds an ordered migration runbook from a list of accounts.
 *
 * Accounts are ordered by `diskUsageMb` ascending — i.e. smaller accounts
 * migrate first. Rationale: small accounts finish quickly, so they surface
 * connectivity, permission, quota, or DNS-cutover problems early, while
 * there's still plenty of the migration window left to fix them, instead of
 * discovering those problems only after committing hours to a large
 * transfer.
 *
 * The generated rsync/scp command strings are plain data for a human to
 * review and run themselves (or hand to an authorized deployment tool) —
 * this function never invokes `child_process` or executes anything.
 */
export function buildRunbook(accounts: AccountEntry[]): RunbookStep[] {
  const sorted = [...accounts].sort((a, b) => a.diskUsageMb - b.diskUsageMb);
  const totalSteps = sorted.length;

  return sorted.map((account, index) => {
    const destUser = account.destUser ?? account.username;
    const rsyncCommand =
      `rsync -avz --progress -e "ssh -p 22" ` +
      `${account.sourceHost}:${account.homeDir}/ ${destUser}@${account.destHost}:${account.homeDir}/`;
    const scpCommand =
      `scp ${account.sourceHost}:/home/${account.username}/${account.username}_backup.tar.gz ` +
      `${account.destHost}:/home/`;

    return {
      position: index + 1,
      totalSteps,
      username: account.username,
      sourceHost: account.sourceHost,
      destHost: account.destHost,
      homeDir: account.homeDir,
      diskUsageMb: account.diskUsageMb,
      destUser,
      rsyncCommand,
      scpCommand,
    };
  });
}

const REMINDER_BANNER = [
  "=".repeat(72),
  "REMINDER: This runbook only PRINTS commands — nothing here has been run.",
  "Review every step below and execute the commands yourself (or via an",
  "authorized deployment channel) before touching any production account.",
  "=".repeat(72),
].join("\n");

/** Renders a human-readable, ordered plain-text migration runbook. */
export function formatRunbookText(steps: RunbookStep[]): string {
  if (steps.length === 0) {
    return `${REMINDER_BANNER}\n\nNo accounts to migrate.\n`;
  }

  const lines: string[] = [
    REMINDER_BANNER,
    "",
    `cPanel Migration Runbook — ${steps.length} account(s), ordered smallest disk usage first`,
    "",
  ];

  for (const step of steps) {
    lines.push(`Step ${step.position}/${step.totalSteps}: ${step.username} (${step.diskUsageMb} MB)`);
    lines.push(`  Source: ${step.sourceHost}:${step.homeDir}`);
    lines.push(`  Dest:   ${step.destUser}@${step.destHost}:${step.homeDir}`);
    lines.push(`  rsync:  ${step.rsyncCommand}`);
    lines.push(`  scp (fallback, packed archive): ${step.scpCommand}`);
    lines.push("");
  }

  lines.push(REMINDER_BANNER);
  return lines.join("\n");
}

/** Renders the runbook as JSON, for `--json` CLI output mode. */
export function formatRunbookJson(steps: RunbookStep[]): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      stepCount: steps.length,
      note: "Generated for manual review. No commands in this runbook have been executed.",
      steps,
    },
    null,
    2,
  );
}
