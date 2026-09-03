import type { ConfigFile, Node } from "../parser.js";
import type { Finding } from "../types.js";
import { isBlock, isDirective } from "../ast-utils.js";

const RULE = "autoindex-on-unrestricted";

/**
 * Warning: flags 'autoindex on;' directives, which enable directory
 * listing.
 *
 * Simplification: this does not do full inheritance-aware access-control
 * analysis. As a lightweight heuristic, a finding is skipped only when the
 * *same* block directly containing 'autoindex on;' also directly contains
 * an 'allow' or 'deny' directive, since that suggests the listing is
 * access-restricted. Restrictions set only in a parent block are not
 * detected; when in doubt, this rule flags.
 */
export function autoindexOnUnrestricted(ast: ConfigFile): Finding[] {
  const findings: Finding[] = [];
  scan(ast.children, findings);
  return findings;
}

function scan(nodes: Node[], findings: Finding[]): void {
  const hasAccessControl = nodes.some(
    (node) => isDirective(node) && (node.name === "allow" || node.name === "deny")
  );

  for (const node of nodes) {
    if (isDirective(node) && node.name === "autoindex" && node.args[0] === "on") {
      if (!hasAccessControl) {
        findings.push({
          rule: RULE,
          severity: "warning",
          message:
            "'autoindex on;' enables directory listing with no 'allow'/'deny' restriction in the same block.",
          line: node.line,
        });
      }
    }
    if (isBlock(node)) {
      scan(node.children, findings);
    }
  }
}
