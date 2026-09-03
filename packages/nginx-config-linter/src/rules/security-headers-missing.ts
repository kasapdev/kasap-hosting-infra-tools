import type { Block, ConfigFile } from "../parser.js";
import type { Finding } from "../types.js";
import { isBlock, isDirective, walk } from "../ast-utils.js";

const RULE = "security-headers-missing";
const REQUIRED_HEADERS = ["X-Frame-Options", "X-Content-Type-Options"];

/**
 * Info: for every 'server' or 'location' block, checks whether it directly
 * (not via inheritance) sets 'add_header X-Frame-Options ...;' and
 * 'add_header X-Content-Type-Options ...;'. Emits one finding per missing
 * header per block (so a block missing both headers produces two findings)
 * rather than combining them into a single message.
 */
export function securityHeadersMissing(ast: ConfigFile): Finding[] {
  const findings: Finding[] = [];
  const targets: Block[] = [];

  walk(ast.children, (node) => {
    if (isBlock(node) && (node.name === "server" || node.name === "location")) {
      targets.push(node);
    }
  });

  for (const block of targets) {
    const presentHeaders = new Set<string>();
    for (const child of block.children) {
      if (!isDirective(child) || child.name !== "add_header") {
        continue;
      }
      const headerName = child.args[0];
      if (headerName) {
        presentHeaders.add(headerName);
      }
    }

    const label =
      block.name === "location" ? `location ${block.args.join(" ")}`.trim() : "server";

    for (const header of REQUIRED_HEADERS) {
      if (!presentHeaders.has(header)) {
        findings.push({
          rule: RULE,
          severity: "info",
          message: `${label} block is missing 'add_header ${header} ...;'.`,
          line: block.line,
        });
      }
    }
  }

  return findings;
}
