import type { ConfigFile } from "../parser.js";
import type { Finding } from "../types.js";
import { collectBlocks, isDirective } from "../ast-utils.js";

const RULE = "client-max-body-size-missing";

/**
 * Info: flags each 'server { ... }' block that has no 'client_max_body_size'
 * directive among its own direct children. This is a simplification — it
 * does not account for inheritance from an enclosing http block.
 */
export function clientMaxBodySizeMissing(ast: ConfigFile): Finding[] {
  const findings: Finding[] = [];

  for (const server of collectBlocks(ast, "server")) {
    const hasDirective = server.children.some(
      (child) => isDirective(child) && child.name === "client_max_body_size"
    );
    if (!hasDirective) {
      findings.push({
        rule: RULE,
        severity: "info",
        message:
          "server block has no 'client_max_body_size' directive set directly within it.",
        line: server.line,
      });
    }
  }

  return findings;
}
