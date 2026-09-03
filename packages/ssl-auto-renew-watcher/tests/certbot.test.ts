import { describe, it, expect, vi } from "vitest";
import { isCertbotAvailable, runCertbotRenew, parseCertbotOutput } from "../src/certbot.js";

const SUCCESS_OUTPUT = `Saving debug log to /var/log/letsencrypt/letsencrypt.log

-------------------------------------------------------------------------------
Processing /etc/letsencrypt/renewal/example.com.conf
Processing /etc/letsencrypt/renewal/shop.example.com.conf
-------------------------------------------------------------------------------

The following certs are not due for renewal yet:
  /etc/letsencrypt/live/static.example.com/fullchain.pem expires on 2026-12-01 (skipped)

Congratulations, all renewals succeeded. The following certs have been renewed:
  /etc/letsencrypt/live/example.com/fullchain.pem (success)
  /etc/letsencrypt/live/shop.example.com/fullchain.pem (success)
-------------------------------------------------------------------------------
`;

const FAILURE_OUTPUT = `Saving debug log to /var/log/letsencrypt/letsencrypt.log

-------------------------------------------------------------------------------
Processing /etc/letsencrypt/renewal/broken.example.com.conf
-------------------------------------------------------------------------------

All renewal attempts failed. The following certs could not be renewed:
  /etc/letsencrypt/live/broken.example.com/fullchain.pem (failure)

-------------------------------------------------------------------------------

The following errors were reported by the client:

Domain: broken.example.com
Type:   connection
Detail: Fetching http://broken.example.com/.well-known/acme-challenge/xxxx: Connection refused

-------------------------------------------------------------------------------
`;

describe("isCertbotAvailable", () => {
  it("returns true when the exec function resolves", async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: "certbot 2.11.0", stderr: "" });
    await expect(isCertbotAvailable(execFn)).resolves.toBe(true);
    expect(execFn).toHaveBeenCalledWith("certbot", ["--version"]);
  });

  it("returns false when the exec function rejects (binary not found)", async () => {
    const execFn = vi.fn().mockRejectedValue(new Error("command not found"));
    await expect(isCertbotAvailable(execFn)).resolves.toBe(false);
  });
});

describe("runCertbotRenew", () => {
  it("defaults to a dry run and never calls the exec function without --dry-run", async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: SUCCESS_OUTPUT, stderr: "" });

    const result = await runCertbotRenew({ execFn });

    expect(result.dryRun).toBe(true);
    expect(result.ranCommand).toContain("--dry-run");
    expect(execFn).toHaveBeenCalledWith("certbot", expect.arrayContaining(["renew", "--dry-run"]));
  });

  it("also dry-runs when execute is explicitly false", async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: SUCCESS_OUTPUT, stderr: "" });

    const result = await runCertbotRenew({ execute: false, execFn });

    expect(result.dryRun).toBe(true);
    expect(execFn).toHaveBeenCalledWith("certbot", expect.arrayContaining(["--dry-run"]));
  });

  it("only runs a real renewal (no --dry-run) when execute is exactly true", async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: SUCCESS_OUTPUT, stderr: "" });

    const result = await runCertbotRenew({ execute: true, execFn });

    expect(result.dryRun).toBe(false);
    expect(result.ranCommand).not.toContain("--dry-run");
    const calledArgs = execFn.mock.calls[0]?.[1] as string[];
    expect(calledArgs).not.toContain("--dry-run");
  });

  it("captures a non-zero exit / rejection as a failed result instead of throwing", async () => {
    const execFn = vi.fn().mockRejectedValue(
      Object.assign(new Error("renewal failed"), {
        stdout: FAILURE_OUTPUT,
        stderr: "some error",
        code: 1,
      })
    );

    const result = await runCertbotRenew({ execute: true, execFn });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe(FAILURE_OUTPUT);
    expect(result.stderr).toBe("some error");
  });
});

describe("parseCertbotOutput", () => {
  it("parses a realistic success block", () => {
    const parsed = parseCertbotOutput(SUCCESS_OUTPUT);

    expect(parsed.succeeded).toEqual(["example.com", "shop.example.com"]);
    expect(parsed.skipped).toEqual(["static.example.com"]);
    expect(parsed.failed).toEqual([]);
  });

  it("parses a realistic failure block", () => {
    const parsed = parseCertbotOutput(FAILURE_OUTPUT);

    expect(parsed.failed).toEqual(["broken.example.com"]);
    expect(parsed.succeeded).toEqual([]);
    expect(parsed.skipped).toEqual([]);
  });

  it("returns empty arrays for output with no recognizable sections", () => {
    const parsed = parseCertbotOutput("Saving debug log to /var/log/letsencrypt/letsencrypt.log\n");

    expect(parsed).toEqual({ succeeded: [], failed: [], skipped: [] });
  });
});
