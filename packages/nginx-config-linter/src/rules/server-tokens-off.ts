import type { ConfigFile } from "../parser.js";
import type { Finding } from "../types.js";
import { collectBlocks, isDirective, walk } from "../ast-utils.js";

const RULE = "server-tokens-off";

/**
 * Security: nginx discloses its version (in error pages and the Server
 * response header) unless 'server_tokens off;' is set. We search the whole
 * tree (not just http/server level) for a 'server_tokens off;' directive;
 * if none exists anywhere, emit a single finding pointing at the first
 * http/server block (or the top of the file if there is none).
 */
export function serverTokensOff(ast: ConfigFile): Finding[] {
  let found = false;
  walk(ast.children, (node) => {
    if (isDirective(node) && node.name === "server_tokens" && node.args[0] === "off") {
      found = true;
    }
  });

  if (found) {
    return [];
  }

  return [
    {
      rule: RULE,
      severity: "security",
      message:
        "No 'server_tokens off;' directive found anywhere in the config; nginx will disclose its version in error pages and the Server header.",
      line: firstRelevantLine(ast),
    },
  ];
}

function firstRelevantLine(ast: ConfigFile): number {
  const candidates = [
    ...collectBlocks(ast, "http"),
    ...collectBlocks(ast, "server"),
  ].map((block) => block.line);

  if (candidates.length > 0) {
    return Math.min(...candidates);
  }

  const first = ast.children[0];
  return first ? first.line : 1;
}
