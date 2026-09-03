import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { connect as netConnect } from "node:net";
import { checkHttp, checkTcp, runCheck, type FetchLike } from "../src/checker.js";

vi.mock("node:net", () => ({
  connect: vi.fn(),
}));

interface FakeSocket extends EventEmitter {
  destroy: () => void;
}

function makeFakeSocket(): FakeSocket {
  const socket = new EventEmitter() as FakeSocket;
  socket.destroy = vi.fn();
  return socket;
}

describe("checkHttp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns up=true for a 200 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200 }) as unknown as FetchLike;
    const result = await checkHttp("http://example.com", 1000, fetchImpl);
    expect(result.up).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns up=true for a 3xx redirect", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 301 }) as unknown as FetchLike;
    const result = await checkHttp("http://example.com", 1000, fetchImpl);
    expect(result.up).toBe(true);
    expect(result.statusCode).toBe(301);
  });

  it("returns up=false for a 500 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 500 }) as unknown as FetchLike;
    const result = await checkHttp("http://example.com", 1000, fetchImpl);
    expect(result.up).toBe(false);
    expect(result.statusCode).toBe(500);
  });

  it("returns up=false with the error message on a network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down")) as unknown as FetchLike;
    const result = await checkHttp("http://example.com", 1000, fetchImpl);
    expect(result.up).toBe(false);
    expect(result.error).toBe("network down");
    expect(result.statusCode).toBeUndefined();
  });

  it("times out and reports an error when the server never responds", async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as FetchLike;

    const result = await checkHttp("http://example.com", 20, fetchImpl);
    expect(result.up).toBe(false);
    expect(result.error).toContain("zaman aşımı");
  });

  it("uses global fetch via runCheck when no override is supplied", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));
    const result = await runCheck({ name: "web", type: "http", url: "http://example.com" });
    expect(result.up).toBe(true);
  });
});

describe("checkTcp", () => {
  it("returns up=true when the socket connects", async () => {
    const socket = makeFakeSocket();
    const connectImpl = vi.mocked(netConnect);
    connectImpl.mockImplementation(() => {
      setTimeout(() => socket.emit("connect"), 5);
      return socket as unknown as ReturnType<typeof netConnect>;
    });

    const result = await checkTcp("example.com", 80, 1000);
    expect(result.up).toBe(true);
    expect(result.statusCode).toBeUndefined();
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns up=false with the error message when the connection is refused", async () => {
    const socket = makeFakeSocket();
    const connectImpl = vi.mocked(netConnect);
    connectImpl.mockImplementation(() => {
      setTimeout(() => socket.emit("error", new Error("ECONNREFUSED")), 5);
      return socket as unknown as ReturnType<typeof netConnect>;
    });

    const result = await checkTcp("example.com", 80, 1000);
    expect(result.up).toBe(false);
    expect(result.error).toBe("ECONNREFUSED");
  });

  it("times out when the socket never connects or errors", async () => {
    const socket = makeFakeSocket();
    const connectImpl = vi.mocked(netConnect);
    connectImpl.mockImplementation(() => socket as unknown as ReturnType<typeof netConnect>);

    const result = await checkTcp("example.com", 80, 20);
    expect(result.up).toBe(false);
    expect(result.error).toContain("zaman aşımı");
  });

  it("dispatches tcp targets via runCheck using the same (mocked) connect", async () => {
    const socket = makeFakeSocket();
    const connectImpl = vi.mocked(netConnect);
    connectImpl.mockImplementation(() => {
      setTimeout(() => socket.emit("connect"), 5);
      return socket as unknown as ReturnType<typeof netConnect>;
    });

    const result = await runCheck({ name: "mc", type: "tcp", host: "example.com", port: 25565 });
    expect(result.up).toBe(true);
  });
});
