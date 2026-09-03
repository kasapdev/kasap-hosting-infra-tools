import type { ConfigFile } from "../parser.js";
import type { Finding } from "../types.js";
import { collectDirectives } from "../ast-utils.js";

const RULE = "ssl-protocols-deprecated";
const DEPRECATED_PROTOCOLS = ["TLSv1", "TLSv1.1"];

/**
 * Security: flags every 'ssl_protocols' directive that enables a deprecated
 * protocol version (TLSv1 or TLSv1.1).
 */
export function sslProtocolsDeprecated(ast: ConfigFile): Finding[] {
  const findings: Finding[] = [];

  for (const directive of collectDirectives(ast, "ssl_protocols")) {
    const found = directive.args.filter((arg) => DEPRECATED_PROTOCOLS.includes(arg));
    if (found.length > 0) {
      findings.push({
        rule: RULE,
        severity: "security",
        message: `Deprecated SSL/TLS protocol(s) enabled: ${found.join(", ")}.`,
        line: directive.line,
      });
    }
  }

  return findings;
}
