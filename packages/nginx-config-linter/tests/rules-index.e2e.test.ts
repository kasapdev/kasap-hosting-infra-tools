import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseNginxConfig } from "../src/parser.js";
import { runAllRules } from "../src/rules/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

describe("runAllRules end-to-end", () => {
  it("flags every rule category on a deliberately vulnerable config", () => {
    const ast = parseNginxConfig(loadFixture("vulnerable.conf"));
    const findings = runAllRules(ast);

    const rulesTriggered = new Set(findings.map((f) => f.rule));
    expect(rulesTriggered).toEqual(
      new Set([
        "server-tokens-off",
        "client-max-body-size-missing",
        "ssl-protocols-deprecated",
        "security-headers-missing",
        "duplicate-listen-without-default-server",
        "autoindex-on-unrestricted",
      ])
    );

    // Findings must be sorted by line number.
    for (let i = 1; i < findings.length; i++) {
      const prev = findings[i - 1];
      const curr = findings[i];
      expect(prev && curr && curr.line).toBeGreaterThanOrEqual(prev?.line ?? 0);
    }
  });

  it("produces no findings on a hardened config", () => {
    const ast = parseNginxConfig(loadFixture("hardened.conf"));
    const findings = runAllRules(ast);
    expect(findings).toEqual([]);
  });
});
