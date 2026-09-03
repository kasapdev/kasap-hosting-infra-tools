import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { initDatabase, recordCheck } from "../src/store.js";
import { createServer, type TargetStatus } from "../src/server.js";
import type { Target } from "../src/config.js";

describe("server", () => {
  let db: DatabaseSync;
  let server: Server;
  let baseUrl: string;

  const targets: Target[] = [
    { name: "web1", type: "http", url: "http://example.com" },
    { name: "mc-server", type: "tcp", host: "example.com", port: 25565 },
  ];

  beforeAll(async () => {
    db = initDatabase(":memory:");
    recordCheck(db, "web1", { up: true, responseTimeMs: 120, statusCode: 200 });
    recordCheck(db, "web1", { up: true, responseTimeMs: 90, statusCode: 200 });
    recordCheck(db, "mc-server", { up: false, responseTimeMs: 5000, error: "ECONNREFUSED" });

    server = createServer(db, targets);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("beklenmeyen sunucu adresi");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns a JSON status array with an entry per configured target", async () => {
    const response = await fetch(`${baseUrl}/api/status`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as TargetStatus[];
    expect(body).toHaveLength(2);

    const web1 = body.find((entry) => entry.name === "web1");
    expect(web1?.status).toBe("up");
    expect(web1?.uptimePercent).toBe(100);
    expect(web1?.lastResponseTimeMs).toBe(90);
    expect(web1?.sparkline.length).toBeGreaterThan(0);

    const mcServer = body.find((entry) => entry.name === "mc-server");
    expect(mcServer?.status).toBe("down");
    expect(mcServer?.uptimePercent).toBe(0);
  });

  it("serves an HTML page at /", async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("<html");
    expect(html).toContain("/api/status");
  });

  it("returns 404 for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/nope`);
    expect(response.status).toBe(404);
  });
});
