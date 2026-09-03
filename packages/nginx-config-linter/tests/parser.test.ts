import { describe, expect, it } from "vitest";
import { parseNginxConfig, NginxParseError } from "../src/parser.js";
import type { Block, Directive } from "../src/parser.js";

describe("parseNginxConfig", () => {
  it("parses a flat list of directives", () => {
    const ast = parseNginxConfig(`
      user nginx;
      worker_processes auto;
    `);
    expect(ast.children).toHaveLength(2);
    const [first, second] = ast.children as [Directive, Directive];
    expect(first).toMatchObject({ type: "directive", name: "user", args: ["nginx"] });
    expect(second).toMatchObject({
      type: "directive",
      name: "worker_processes",
      args: ["auto"],
    });
  });

  it("parses nested blocks at least 3 levels deep", () => {
    const ast = parseNginxConfig(`
      http {
        server {
          location / {
            proxy_pass http://backend;
          }
        }
      }
    `);
    const http = ast.children[0] as Block;
    expect(http.type).toBe("block");
    expect(http.name).toBe("http");

    const server = http.children[0] as Block;
    expect(server.name).toBe("server");

    const location = server.children[0] as Block;
    expect(location.name).toBe("location");
    expect(location.args).toEqual(["/"]);

    const proxyPass = location.children[0] as Directive;
    expect(proxyPass).toMatchObject({ name: "proxy_pass", args: ["http://backend"] });
  });

  it("parses directives with multiple args", () => {
    const ast = parseNginxConfig(`listen 443 ssl http2 default_server;`);
    const directive = ast.children[0] as Directive;
    expect(directive.args).toEqual(["443", "ssl", "http2", "default_server"]);
  });

  it("parses quoted string args and strips the surrounding quotes", () => {
    const ast = parseNginxConfig(
      `add_header Content-Security-Policy "default-src 'self'";`
    );
    const directive = ast.children[0] as Directive;
    expect(directive.args).toEqual(["Content-Security-Policy", "default-src 'self'"]);
  });

  it("ignores comments, including trailing same-line comments", () => {
    const ast = parseNginxConfig(`
      # top level comment
      server { # opening comment
        listen 80; # listen comment
        # another comment
      }
    `);
    expect(ast.children).toHaveLength(1);
    const server = ast.children[0] as Block;
    expect(server.children).toHaveLength(1);
    expect((server.children[0] as Directive).name).toBe("listen");
  });

  it("records correct line numbers for directives and nested blocks", () => {
    const ast = parseNginxConfig("user nginx;\nserver {\n  listen 80;\n}");
    const [userDirective, serverBlock] = ast.children as [Directive, Block];
    expect(userDirective.line).toBe(1);
    expect(serverBlock.line).toBe(2);
    expect((serverBlock.children[0] as Directive).line).toBe(3);
  });

  it("throws NginxParseError with the right line on an unmatched opening brace", () => {
    const source = "server {\n  listen 80;\n";
    expect(() => parseNginxConfig(source)).toThrow(NginxParseError);
    try {
      parseNginxConfig(source);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NginxParseError);
      expect((err as NginxParseError).line).toBe(3);
    }
  });

  it("throws NginxParseError on an unmatched closing brace", () => {
    const source = "server {\n  listen 80;\n}\n}";
    expect(() => parseNginxConfig(source)).toThrow(NginxParseError);
    try {
      parseNginxConfig(source);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NginxParseError);
      expect((err as NginxParseError).line).toBe(4);
    }
  });

  it("throws NginxParseError on a directive missing its ';' before EOF", () => {
    expect(() => parseNginxConfig("user nginx")).toThrow(NginxParseError);
  });

  it("throws NginxParseError on a directive missing its ';' before an unexpected '}'", () => {
    const source = "server {\n  listen 80\n}";
    expect(() => parseNginxConfig(source)).toThrow(NginxParseError);
    try {
      parseNginxConfig(source);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NginxParseError);
      expect((err as NginxParseError).line).toBe(3);
    }
  });
});
