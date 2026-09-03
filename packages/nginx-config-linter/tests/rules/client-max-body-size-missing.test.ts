import { describe, expect, it } from "vitest";
import { parseNginxConfig } from "../../src/parser.js";
import { clientMaxBodySizeMissing } from "../../src/rules/client-max-body-size-missing.js";

describe("client-max-body-size-missing rule", () => {
  it("flags a server block with no client_max_body_size directive", () => {
    const ast = parseNginxConfig(`
      http {
        server {
          listen 80;
        }
      }
    `);
    const findings = clientMaxBodySizeMissing(ast);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "client-max-body-size-missing",
      severity: "info",
    });
  });

  it("does not flag a server block that sets client_max_body_size", () => {
    const ast = parseNginxConfig(`
      http {
        server {
          listen 80;
          client_max_body_size 10m;
        }
      }
    `);
    expect(clientMaxBodySizeMissing(ast)).toHaveLength(0);
  });

  it("flags one finding per offending server block", () => {
    const ast = parseNginxConfig(`
      http {
        server { listen 80; }
        server { listen 81; client_max_body_size 5m; }
        server { listen 82; }
      }
    `);
    expect(clientMaxBodySizeMissing(ast)).toHaveLength(2);
  });
});
