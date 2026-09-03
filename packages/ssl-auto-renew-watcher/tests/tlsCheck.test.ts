import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type tls from "node:tls";
import { checkCertExpiry, classifyExpiry } from "../src/tlsCheck.js";

type FakeSocket = EventEmitter & {
  getPeerCertificate: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function makeFakeSocket(): FakeSocket {
  const socket = new EventEmitter() as FakeSocket;
  socket.getPeerCertificate = vi.fn();
  socket.destroy = vi.fn();
  return socket;
}

describe("checkCertExpiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes daysRemaining for a cert expiring in the future", async () => {
    const socket = makeFakeSocket();
    socket.getPeerCertificate.mockReturnValue({
      valid_to: "Oct  4 00:00:00 2026 GMT",
      issuer: { O: "Let's Encrypt", CN: "R3" },
    });

    const connectFn = vi.fn((options: tls.ConnectionOptions, callback?: () => void) => {
      queueMicrotask(() => callback?.());
      return socket as unknown as tls.TLSSocket;
    });

    const result = await checkCertExpiry("example.com", 443, 5000, connectFn);

    expect(result.error).toBeUndefined();
    if (!result.error) {
      expect(result.daysRemaining).toBe(30);
      expect(result.issuer).toBe("Let's Encrypt");
      expect(result.validTo.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    }
    expect(connectFn).toHaveBeenCalledWith(
      expect.objectContaining({ host: "example.com", port: 443, servername: "example.com", timeout: 5000 }),
      expect.any(Function)
    );
  });

  it("returns an error shape when the connection errors", async () => {
    const socket = makeFakeSocket();
    const connectFn = vi.fn(() => {
      queueMicrotask(() => socket.emit("error", new Error("ECONNREFUSED")));
      return socket as unknown as tls.TLSSocket;
    });

    const result = await checkCertExpiry("bad.example.com", 443, 5000, connectFn);

    expect(result.error).toBe("ECONNREFUSED");
    expect("daysRemaining" in result).toBe(false);
  });

  it("returns an error shape when the connection times out", async () => {
    const socket = makeFakeSocket();
    const connectFn = vi.fn(() => {
      queueMicrotask(() => socket.emit("timeout"));
      return socket as unknown as tls.TLSSocket;
    });

    const result = await checkCertExpiry("slow.example.com", 443, 1000, connectFn);

    expect(result.error).toContain("timed out");
  });

  it("returns an error shape when the certificate has no valid_to", async () => {
    const socket = makeFakeSocket();
    socket.getPeerCertificate.mockReturnValue({});

    const connectFn = vi.fn((options: tls.ConnectionOptions, callback?: () => void) => {
      queueMicrotask(() => callback?.());
      return socket as unknown as tls.TLSSocket;
    });

    const result = await checkCertExpiry("empty-cert.example.com", 443, 5000, connectFn);

    expect(result.error).toBe("No certificate returned by peer");
  });
});

describe("classifyExpiry", () => {
  it("is expired at exactly 0 days remaining", () => {
    expect(classifyExpiry(0, 14)).toBe("expired");
  });

  it("is expired for negative days remaining", () => {
    expect(classifyExpiry(-5, 14)).toBe("expired");
  });

  it("is warning exactly at the warning threshold", () => {
    expect(classifyExpiry(14, 14)).toBe("warning");
  });

  it("is warning for 1 day remaining", () => {
    expect(classifyExpiry(1, 14)).toBe("warning");
  });

  it("is ok just above the warning threshold", () => {
    expect(classifyExpiry(15, 14)).toBe("ok");
  });

  it("is ok well above the warning threshold", () => {
    expect(classifyExpiry(90, 14)).toBe("ok");
  });
});
