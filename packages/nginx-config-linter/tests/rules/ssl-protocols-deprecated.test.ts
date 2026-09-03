import { describe, expect, it } from "vitest";
import { parseNginxConfig } from "../../src/parser.js";
import { sslProtocolsDeprecated } from "../../src/rules/ssl-protocols-deprecated.js";

describe("ssl-protocols-deprecated rule", () => {
  it("flags ssl_protocols that include TLSv1", () => {
    const ast = parseNginxConfig(`
      server {
        ssl_protocols TLSv1 TLSv1.2;
      }
    `);
    const findings = sslProtocolsDeprecated(ast);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "ssl-protocols-deprecated",
      severity: "security",
    });
    expect(findings[0]?.message).toContain("TLSv1");
  });

  it("flags ssl_protocols that include TLSv1.1", () => {
    const ast = parseNginxConfig(`
      server {
        ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
      }
    `);
    const findings = sslProtocolsDeprecated(ast);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("TLSv1.1");
  });

  it("does not flag ssl_protocols using only modern versions", () => {
    const ast = parseNginxConfig(`
      server {
        ssl_protocols TLSv1.2 TLSv1.3;
      }
    `);
    expect(sslProtocolsDeprecated(ast)).toHaveLength(0);
  });
});
