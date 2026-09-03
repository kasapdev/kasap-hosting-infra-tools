import { describe, expect, it } from "vitest";
import { parseNginxConfig } from "../../src/parser.js";
import { duplicateListenWithoutDefaultServer } from "../../src/rules/duplicate-listen-without-default-server.js";

describe("duplicate-listen-without-default-server rule", () => {
  it("flags a port with multiple listen directives and no default_server", () => {
    const ast = parseNginxConfig(`
      http {
        server { listen 80; server_name a.example.com; }
        server { listen 80; server_name b.example.com; }
      }
    `);
    const findings = duplicateListenWithoutDefaultServer(ast);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "duplicate-listen-without-default-server",
      severity: "warning",
    });
  });

  it("handles host:port and bracketed IPv6 listen forms", () => {
    const ast = parseNginxConfig(`
      http {
        server { listen 0.0.0.0:8080; }
        server { listen [::]:8080; }
      }
    `);
    const findings = duplicateListenWithoutDefaultServer(ast);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("8080");
  });

  it("does not flag when one of the duplicates is default_server", () => {
    const ast = parseNginxConfig(`
      http {
        server { listen 80 default_server; server_name a.example.com; }
        server { listen 80; server_name b.example.com; }
      }
    `);
    expect(duplicateListenWithoutDefaultServer(ast)).toHaveLength(0);
  });

  it("does not flag a single listen directive per port", () => {
    const ast = parseNginxConfig(`
      http {
        server { listen 80; }
        server { listen 443 ssl; }
      }
    `);
    expect(duplicateListenWithoutDefaultServer(ast)).toHaveLength(0);
  });
});
