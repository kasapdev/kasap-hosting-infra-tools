import { describe, expect, it } from "vitest";
import { parseNginxConfig } from "../../src/parser.js";
import { securityHeadersMissing } from "../../src/rules/security-headers-missing.js";

describe("security-headers-missing rule", () => {
  it("flags a server block missing both required headers", () => {
    const ast = parseNginxConfig(`
      server {
        listen 80;
      }
    `);
    const findings = securityHeadersMissing(ast);
    expect(findings).toHaveLength(2);
    for (const finding of findings) {
      expect(finding).toMatchObject({
        rule: "security-headers-missing",
        severity: "info",
      });
    }
  });

  it("flags a location block missing one header", () => {
    const ast = parseNginxConfig(`
      server {
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";

        location / {
          add_header X-Frame-Options "SAMEORIGIN";
        }
      }
    `);
    const findings = securityHeadersMissing(ast);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("X-Content-Type-Options");
  });

  it("does not flag blocks that set both required headers", () => {
    const ast = parseNginxConfig(`
      server {
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";

        location / {
          add_header X-Frame-Options "SAMEORIGIN";
          add_header X-Content-Type-Options "nosniff";
        }
      }
    `);
    expect(securityHeadersMissing(ast)).toHaveLength(0);
  });
});
