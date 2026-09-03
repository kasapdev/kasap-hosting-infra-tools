import { describe, expect, it } from "vitest";
import { formatJson, formatText } from "../src/format.js";
import type { Finding } from "../src/types.js";

const findings: Finding[] = [
  {
    rule: "server-tokens-off",
    severity: "security",
    message: "missing server_tokens off",
    line: 5,
  },
  {
    rule: "autoindex-on-unrestricted",
    severity: "warning",
    message: "autoindex on found",
    line: 2,
  },
  {
    rule: "client-max-body-size-missing",
    severity: "info",
    message: "missing client_max_body_size",
    line: 10,
  },
];

describe("formatText", () => {
  it("renders one line per finding, sorted by line number", () => {
    const output = formatText(findings);
    const lines = output.split("\n");
    expect(lines[0]).toContain("line 2");
    expect(lines[1]).toContain("line 5");
    expect(lines[2]).toContain("line 10");
  });

  it("includes severity, rule name, and message per line", () => {
    const output = formatText(findings);
    expect(output).toContain(
      "WARNING  line 2  [autoindex-on-unrestricted]  autoindex on found"
    );
  });

  it("includes a trailing summary count line", () => {
    const output = formatText(findings);
    expect(output).toContain("1 security, 1 warning, 1 info");
  });

  it("reports no issues found for an empty list", () => {
    expect(formatText([])).toContain("No issues found");
  });

  it("optionally prefixes the output with a file path", () => {
    const output = formatText(findings, "/etc/nginx/nginx.conf");
    expect(output.split("\n")[0]).toBe("/etc/nginx/nginx.conf");
  });
});

describe("formatJson", () => {
  it("produces JSON parseable back into the findings, sorted by line", () => {
    const output = formatJson(findings);
    const parsed = JSON.parse(output) as Finding[];
    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.line).toBe(2);
    expect(parsed[1]?.line).toBe(5);
    expect(parsed[2]?.line).toBe(10);
  });
});
