import { describe, expect, it } from "vitest";
import { parseNginxConfig } from "../../src/parser.js";
import { autoindexOnUnrestricted } from "../../src/rules/autoindex-on-unrestricted.js";

describe("autoindex-on-unrestricted rule", () => {
  it("flags autoindex on; with no allow/deny in the same block", () => {
    const ast = parseNginxConfig(`
      location /files {
        autoindex on;
      }
    `);
    const findings = autoindexOnUnrestricted(ast);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "autoindex-on-unrestricted",
      severity: "warning",
    });
  });

  it("does not flag autoindex off;", () => {
    const ast = parseNginxConfig(`
      location /files {
        autoindex off;
      }
    `);
    expect(autoindexOnUnrestricted(ast)).toHaveLength(0);
  });

  it("skips autoindex on; when the same block also restricts via allow/deny", () => {
    const ast = parseNginxConfig(`
      location /files {
        autoindex on;
        allow 10.0.0.0/8;
        deny all;
      }
    `);
    expect(autoindexOnUnrestricted(ast)).toHaveLength(0);
  });
});
