import { describe, expect, it } from "vitest";
import { parseNginxConfig } from "../../src/parser.js";
import { serverTokensOff } from "../../src/rules/server-tokens-off.js";

describe("server-tokens-off rule", () => {
  it("flags a config with no server_tokens off directive anywhere", () => {
    const ast = parseNginxConfig(`
      http {
        server {
          listen 80;
        }
      }
    `);
    const findings = serverTokensOff(ast);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "server-tokens-off",
      severity: "security",
    });
  });

  it("does not flag when server_tokens off is present at the http level", () => {
    const ast = parseNginxConfig(`
      http {
        server_tokens off;
        server {
          listen 80;
        }
      }
    `);
    expect(serverTokensOff(ast)).toHaveLength(0);
  });

  it("does not flag when server_tokens off is present at the server level", () => {
    const ast = parseNginxConfig(`
      http {
        server {
          server_tokens off;
          listen 80;
        }
      }
    `);
    expect(serverTokensOff(ast)).toHaveLength(0);
  });
});
