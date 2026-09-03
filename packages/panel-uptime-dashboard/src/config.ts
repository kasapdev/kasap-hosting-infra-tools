import { readFileSync } from "node:fs";

export interface HttpTarget {
  name: string;
  type: "http";
  url: string;
  timeoutMs?: number;
}

export interface TcpTarget {
  name: string;
  type: "tcp";
  host: string;
  port: number;
  timeoutMs?: number;
}

export type Target = HttpTarget | TcpTarget;

interface RawTarget {
  name?: unknown;
  type?: unknown;
  url?: unknown;
  host?: unknown;
  port?: unknown;
  timeoutMs?: unknown;
}

const DEFAULT_CONFIG_PATH = "./uptime.config.json";

/** Resolves the config file path from a CLI arg, then UPTIME_CONFIG_PATH, then the default. */
export function resolveConfigPath(argv: string[] = process.argv.slice(2)): string {
  const argPath = argv[0];
  if (argPath) return argPath;
  return process.env.UPTIME_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
}

function validateOptionalTimeout(value: unknown, name: string, index: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Config geçersiz: targets[${index}] (${name}).timeoutMs pozitif bir sayı olmalı`);
  }
  return value;
}

function validateTarget(entry: unknown, index: number): Target {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`Config geçersiz: targets[${index}] bir obje olmalı`);
  }
  const raw = entry as RawTarget;

  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    throw new Error(`Config geçersiz: targets[${index}].name eksik veya boş bir string olmalı`);
  }
  const name = raw.name;

  if (raw.type !== "http" && raw.type !== "tcp") {
    throw new Error(`Config geçersiz: targets[${index}] (${name}).type "http" ya da "tcp" olmalı`);
  }

  const timeoutMs = validateOptionalTimeout(raw.timeoutMs, name, index);

  if (raw.type === "http") {
    if (typeof raw.url !== "string" || raw.url.trim() === "") {
      throw new Error(`Config geçersiz: targets[${index}] (${name}) type=http için url zorunlu`);
    }
    return { name, type: "http", url: raw.url, timeoutMs };
  }

  if (typeof raw.host !== "string" || raw.host.trim() === "") {
    throw new Error(`Config geçersiz: targets[${index}] (${name}) type=tcp için host zorunlu`);
  }
  if (typeof raw.port !== "number" || !Number.isInteger(raw.port) || raw.port <= 0 || raw.port > 65535) {
    throw new Error(`Config geçersiz: targets[${index}] (${name}) type=tcp için geçerli bir port (1-65535) zorunlu`);
  }
  return { name, type: "tcp", host: raw.host, port: raw.port, timeoutMs };
}

/** Validates and normalizes a parsed JSON value into a list of targets. Throws on any shape mismatch. */
export function parseTargets(raw: unknown): Target[] {
  if (!Array.isArray(raw)) {
    throw new Error("Config geçersiz: kök eleman bir dizi (array) olmalı, ör. [{...}, {...}]");
  }
  return raw.map((entry, index) => validateTarget(entry, index));
}

/** Reads and validates the monitoring config file at `path` (default resolved from CLI arg / env / default path). */
export function loadConfig(path: string = resolveConfigPath()): Target[] {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(`Config dosyası okunamadı: ${path} (${(err as Error).message})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`Config dosyası geçerli JSON değil: ${path} (${(err as Error).message})`);
  }

  return parseTargets(parsed);
}
