import { readFileSync } from "node:fs";
import path from "node:path";

export interface HostConfig {
  host: string;
  port?: number;
}

export interface WatchSettings {
  warningDays: number;
  discordWebhookUrl?: string;
  slackWebhookUrl?: string;
}

export interface WatchConfig {
  hosts: HostConfig[];
  settings: WatchSettings;
}

const DEFAULT_CONFIG_PATH = "./ssl-watch.config.json";

/** Resolves the config file path: explicit arg > `SSL_WATCH_CONFIG_PATH` env > default. */
export function resolveConfigPath(cliPath?: string): string {
  return cliPath ?? process.env.SSL_WATCH_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
}

/**
 * Loads and validates the JSON list of hosts to watch, of the shape
 * `[{ "host": string, "port"?: number }, ...]`.
 */
export function loadHostsConfig(configPath: string): HostConfig[] {
  const resolved = path.resolve(configPath);
  const raw = readFileSync(resolved, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse ssl-watch config at ${resolved}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `Invalid ssl-watch config at ${resolved}: expected a JSON array of { "host": string, "port"?: number } entries`
    );
  }

  return parsed.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || typeof (entry as { host?: unknown }).host !== "string") {
      throw new Error(
        `Invalid entry at index ${index} in ${resolved}: expected { "host": string, "port"?: number }`
      );
    }
    const candidate = entry as { host: string; port?: unknown };
    const port = typeof candidate.port === "number" ? candidate.port : undefined;
    return port === undefined ? { host: candidate.host } : { host: candidate.host, port };
  });
}

/** Reads runtime settings from the environment (warning threshold + webhook URLs). */
export function loadSettings(): WatchSettings {
  const warningDaysRaw = process.env.SSL_WARNING_DAYS;
  const parsedWarningDays = warningDaysRaw ? Number.parseInt(warningDaysRaw, 10) : NaN;
  const warningDays = Number.isFinite(parsedWarningDays) && parsedWarningDays > 0 ? parsedWarningDays : 14;

  return {
    warningDays,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || undefined,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || undefined,
  };
}

/** Convenience wrapper: loads both the host list (from file) and the env-backed settings. */
export function loadWatchConfig(cliConfigPath?: string): WatchConfig {
  const configPath = resolveConfigPath(cliConfigPath);
  const hosts = loadHostsConfig(configPath);
  const settings = loadSettings();
  return { hosts, settings };
}
