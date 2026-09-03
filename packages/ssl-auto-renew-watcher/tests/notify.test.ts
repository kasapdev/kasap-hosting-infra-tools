import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendConsoleNotification, sendWebhookNotification, notifyAll } from "../src/notify.js";

function makeFetchMock(ok: boolean, status = ok ? 200 : 500) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Internal Server Error",
  });
}

describe("sendConsoleNotification", () => {
  it("logs the message with a prefix", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    sendConsoleNotification("test message");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const loggedLine = logSpy.mock.calls[0]?.[0] as string;
    expect(loggedLine).toContain("test message");

    logSpy.mockRestore();
  });
});

describe("sendWebhookNotification", () => {
  it("sends { content } for discord format", async () => {
    const fetchImpl = makeFetchMock(true);

    await sendWebhookNotification("https://discord.example/webhook", "hello", "discord", fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://discord.example/webhook");
    expect(JSON.parse(init.body as string)).toEqual({ content: "hello" });
  });

  it("sends { text } for slack format", async () => {
    const fetchImpl = makeFetchMock(true);

    await sendWebhookNotification("https://slack.example/webhook", "hello", "slack", fetchImpl as unknown as typeof fetch);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ text: "hello" });
  });

  it("throws when the response is not ok", async () => {
    const fetchImpl = makeFetchMock(false, 500);

    await expect(
      sendWebhookNotification("https://discord.example/webhook", "hello", "discord", fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow(/500/);
  });
});

describe("notifyAll", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("always logs to console even when no webhooks are configured", async () => {
    const fetchImpl = makeFetchMock(true);

    await notifyAll("hello", {}, fetchImpl as unknown as typeof fetch);

    expect(logSpy).toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it("calls fetch once per configured webhook", async () => {
    const fetchImpl = makeFetchMock(true);

    await notifyAll(
      "hello",
      { discordWebhookUrl: "https://discord.example/webhook", slackWebhookUrl: "https://slack.example/webhook" },
      fetchImpl as unknown as typeof fetch
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it("does not throw when a webhook fails, and still logs to console", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = makeFetchMock(false, 500);

    await expect(
      notifyAll("hello", { discordWebhookUrl: "https://discord.example/webhook" }, fetchImpl as unknown as typeof fetch)
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
