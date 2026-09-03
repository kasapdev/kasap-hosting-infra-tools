import type { Finding, Severity } from "./types.js";

/**
 * Human-readable output: one line per finding (sorted by line number), of
 * the form "<SEVERITY>  line <n>  [<rule>]  <message>", followed by a blank
 * line and a summary count, e.g. "3 security, 2 warning, 4 info".
 */
export function formatText(findings: Finding[], filePath?: string): string {
  const sorted = [...findings].sort((a, b) => a.line - b.line);
  const lines: string[] = [];

  if (filePath) {
    lines.push(filePath);
  }

  if (sorted.length === 0) {
    lines.push("No issues found.");
    return lines.join("\n");
  }

  for (const finding of sorted) {
    lines.push(
      `${finding.severity.toUpperCase()}  line ${finding.line}  [${finding.rule}]  ${finding.message}`
    );
  }

  const counts: Record<Severity, number> = { security: 0, warning: 0, info: 0 };
  for (const finding of sorted) {
    counts[finding.severity]++;
  }

  const summaryParts: string[] = [];
  if (counts.security > 0) summaryParts.push(`${counts.security} security`);
  if (counts.warning > 0) summaryParts.push(`${counts.warning} warning`);
  if (counts.info > 0) summaryParts.push(`${counts.info} info`);

  lines.push("");
  lines.push(summaryParts.length > 0 ? summaryParts.join(", ") : "0 issues");

  return lines.join("\n");
}

/** Machine-readable output: findings sorted by line, pretty-printed JSON. */
export function formatJson(findings: Finding[]): string {
  const sorted = [...findings].sort((a, b) => a.line - b.line);
  return JSON.stringify(sorted, null, 2);
}
