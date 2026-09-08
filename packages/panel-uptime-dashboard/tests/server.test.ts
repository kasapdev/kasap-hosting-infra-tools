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

  it("returns a target with no recorded checks as unknown/null rather than omitting it", async () => {
    // mc-server is configured but has one recorded check; add a third target with none.
    const targetsWithoutHistory: Target[] = [...targets, { name: "no-data-yet", type: "http", url: "http://example.com" }];
    const serverWithoutHistory = createServer(db, targetsWithoutHistory);
    await new Promise<void>((resolve) => serverWithoutHistory.listen(0, "127.0.0.1", resolve));
    const address = serverWithoutHistory.address();
    if (address === null || typeof address === "string") throw new Error("beklenmeyen sunucu adresi");

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/status`);
      const body = (await response.json()) as TargetStatus[];
      const noData = body.find((entry) => entry.name === "no-data-yet");
      expect(noData).toEqual({
        name: "no-data-yet",
        status: "unknown",
        uptimePercent: null,
        lastResponseTimeMs: null,
        sparkline: "",
        lastCheckedAt: null,
      });
    } finally {
      await new Promise<void>((resolve, reject) => serverWithoutHistory.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("serves the same HTML page at /index.html as at /", async () => {
    const response = await fetch(`${baseUrl}/index.html`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});

describe("GET /api/incidents", () => {
  let db: DatabaseSync;
  let server: Server;
  let baseUrl: string;

  const targets: Target[] = [{ name: "web1", type: "http", url: "http://example.com" }];

  beforeAll(async () => {
    db = initDatabase(":memory:");
    recordCheck(db, "web1", { up: true, responseTimeMs: 100 });
    recordCheck(db, "web1", { up: false, responseTimeMs: 0, error: "boom" });
    recordCheck(db, "web1", { up: false, responseTimeMs: 0, error: "boom" });
    recordCheck(db, "web1", { up: true, responseTimeMs: 90 });

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

  it("returns the resolved incident for a target with a closed down run", async () => {
    const response = await fetch(`${baseUrl}/api/incidents?target=web1`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ endedAt: string | null; downChecks: number }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.downChecks).toBe(2);
    expect(body[0]?.endedAt).not.toBeNull();
  });

  it("returns 400 when the target query parameter is missing", async () => {
    const response = await fetch(`${baseUrl}/api/incidents`);
    expect(response.status).toBe(400);
  });

  it("returns 404 for a target that isn't configured", async () => {
    const response = await fetch(`${baseUrl}/api/incidents?target=does-not-exist`);
    expect(response.status).toBe(404);
  });
});
