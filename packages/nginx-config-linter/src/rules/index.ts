import type { ConfigFile } from "../parser.js";
import type { Finding } from "../types.js";
import { serverTokensOff } from "./server-tokens-off.js";
import { clientMaxBodySizeMissing } from "./client-max-body-size-missing.js";
import { sslProtocolsDeprecated } from "./ssl-protocols-deprecated.js";
import { securityHeadersMissing } from "./security-headers-missing.js";
import { duplicateListenWithoutDefaultServer } from "./duplicate-listen-without-default-server.js";
import { autoindexOnUnrestricted } from "./autoindex-on-unrestricted.js";

export { serverTokensOff } from "./server-tokens-off.js";
export { clientMaxBodySizeMissing } from "./client-max-body-size-missing.js";
export { sslProtocolsDeprecated } from "./ssl-protocols-deprecated.js";
export { securityHeadersMissing } from "./security-headers-missing.js";
export { duplicateListenWithoutDefaultServer } from "./duplicate-listen-without-default-server.js";
export { autoindexOnUnrestricted } from "./autoindex-on-unrestricted.js";

type Rule = (ast: ConfigFile) => Finding[];

const ALL_RULES: Rule[] = [
  serverTokensOff,
  clientMaxBodySizeMissing,
  sslProtocolsDeprecated,
  securityHeadersMissing,
  duplicateListenWithoutDefaultServer,
  autoindexOnUnrestricted,
];

/** Runs every lint rule against the AST and returns findings sorted by line. */
export function runAllRules(ast: ConfigFile): Finding[] {
  const findings = ALL_RULES.flatMap((rule) => rule(ast));
  return findings.sort((a, b) => a.line - b.line);
}
