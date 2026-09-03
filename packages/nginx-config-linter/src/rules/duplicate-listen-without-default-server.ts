import type { ConfigFile } from "../parser.js";
import type { Finding } from "../types.js";
import { collectDirectives } from "../ast-utils.js";

const RULE = "duplicate-listen-without-default-server";

interface ListenEntry {
  port: number;
  line: number;
  hasDefaultServer: boolean;
}

/**
 * Warning: groups every 'listen' directive in the tree by port number. For
 * any port with more than one 'listen' directive where none of them carries
 * the 'default_server' flag, emits one finding (referencing the line of the
 * first 'listen' in that group) noting that request routing for that port
 * is ambiguous.
 */
export function duplicateListenWithoutDefaultServer(ast: ConfigFile): Finding[] {
  const entries: ListenEntry[] = [];

  for (const directive of collectDirectives(ast, "listen")) {
    const addr = directive.args[0];
    if (!addr) {
      continue;
    }
    const port = parseListenPort(addr);
    if (port === null) {
      continue;
    }
    entries.push({
      port,
      line: directive.line,
      hasDefaultServer: directive.args.slice(1).includes("default_server"),
    });
  }

  const byPort = new Map<number, ListenEntry[]>();
  for (const entry of entries) {
    const group = byPort.get(entry.port);
    if (group) {
      group.push(entry);
    } else {
      byPort.set(entry.port, [entry]);
    }
  }

  const findings: Finding[] = [];
  for (const [port, group] of byPort) {
    if (group.length < 2) {
      continue;
    }
    const hasAnyDefaultServer = group.some((entry) => entry.hasDefaultServer);
    if (hasAnyDefaultServer) {
      continue;
    }
    const firstEntry = group[0];
    if (!firstEntry) {
      continue;
    }
    findings.push({
      rule: RULE,
      severity: "warning",
      message: `Port ${port} has ${group.length} 'listen' directives but none is marked 'default_server'; which server block handles unmatched requests on this port is ambiguous.`,
      line: firstEntry.line,
    });
  }

  return findings.sort((a, b) => a.line - b.line);
}

/**
 * Extracts the numeric port from a 'listen' directive's address argument.
 * Handles bare ports ("80"), host:port ("0.0.0.0:80"), and bracketed IPv6
 * ("[::]:80"). Returns null for forms with no discernible port (e.g. unix
 * sockets).
 */
function parseListenPort(addr: string): number | null {
  let portStr: string | undefined;

  if (addr.startsWith("[")) {
    const closeIdx = addr.indexOf("]");
    if (closeIdx === -1) {
      return null;
    }
    const rest = addr.slice(closeIdx + 1);
    if (!rest.startsWith(":")) {
      return null;
    }
    portStr = rest.slice(1);
  } else if (addr.includes(":")) {
    const idx = addr.lastIndexOf(":");
    portStr = addr.slice(idx + 1);
  } else {
    portStr = addr;
  }

  if (!portStr) {
    return null;
  }
  const num = Number(portStr);
  if (!Number.isInteger(num) || Number.isNaN(num)) {
    return null;
  }
  return num;
}
