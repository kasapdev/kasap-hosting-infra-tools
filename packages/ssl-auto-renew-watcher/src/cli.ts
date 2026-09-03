#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
loadEnv();

import { Command } from "commander";
import { checkCertExpiry, classifyExpiry, isCertCheckFailure } from "./tlsCheck.js";
import { isCertbotAvailable, runCertbotRenew, parseCertbotOutput } from "./certbot.js";
import { notifyAll, type NotifyTargets } from "./notify.js";
import { loadWatchConfig, loadSettings } from "./config.js";

function padCol(value: string, width: number): string {
  return value.length >= width ? `${value} ` : value.padEnd(width);
}

async function runCheck(configPathArg?: string): Promise<void> {
  const { hosts, settings } = loadWatchConfig(configPathArg);
  const targets: NotifyTargets = {
    discordWebhookUrl: settings.discordWebhookUrl,
    slackWebhookUrl: settings.slackWebhookUrl,
  };

  if (hosts.length === 0) {
    console.log("[ssl-watch] No hosts configured. Nothing to check.");
    return;
  }

  console.log(padCol("HOST", 32) + padCol("DAYS LEFT", 12) + "STATUS");
  console.log("-".repeat(60));

  for (const entry of hosts) {
    const port = entry.port ?? 443;
    const result = await checkCertExpiry(entry.host, port);

    if (isCertCheckFailure(result)) {
      console.log(padCol(entry.host, 32) + padCol("-", 12) + `ERROR: ${result.error}`);
      await notifyAll(
        `⚠️ ${entry.host}:${port} sertifika kontrolü başarısız oldu: ${result.error}`,
        targets
      );
      continue;
    }

    const status = classifyExpiry(result.daysRemaining, settings.warningDays);
    console.log(padCol(entry.host, 32) + padCol(String(result.daysRemaining), 12) + status.toUpperCase());

    if (status === "expired") {
      await notifyAll(
        `🛑 ${entry.host} sertifikasının süresi doldu! (${result.daysRemaining} gün önce)`,
        targets
      );
    } else if (status === "warning") {
      await notifyAll(
        `⚠️ ${entry.host} sertifikası ${result.daysRemaining} gün içinde sona eriyor!`,
        targets
      );
    }
  }
}

async function runRenew(execute: boolean): Promise<void> {
  const settings = loadSettings();
  const targets: NotifyTargets = {
    discordWebhookUrl: settings.discordWebhookUrl,
    slackWebhookUrl: settings.slackWebhookUrl,
  };

  const available = await isCertbotAvailable();
  if (!available) {
    console.log("[ssl-watch] certbot binary not found on PATH. Skipping renewal.");
    return;
  }

  const result = await runCertbotRenew({ execute });
  const parsed = parseCertbotOutput(result.stdout);

  console.log(
    `[ssl-watch] Ran: ${result.ranCommand} (dryRun=${result.dryRun}, exitCode=${result.exitCode})`
  );
  console.log(`  Succeeded: ${parsed.succeeded.length ? parsed.succeeded.join(", ") : "-"}`);
  console.log(`  Skipped:   ${parsed.skipped.length ? parsed.skipped.join(", ") : "-"}`);
  console.log(`  Failed:    ${parsed.failed.length ? parsed.failed.join(", ") : "-"}`);

  if (result.exitCode !== 0 || parsed.failed.length > 0) {
    const detail = parsed.failed.length > 0 ? parsed.failed.join(", ") : result.stderr || "bilinmeyen hata";
    await notifyAll(
      `🛑 certbot renew başarısız oldu (${result.dryRun ? "dry-run" : "gerçek çalıştırma"}): ${detail}`,
      targets
    );
  }
}

const program = new Command();

program
  .name("ssl-auto-renew-watcher")
  .description("Watches TLS certificate expiry across customer domains and optionally drives certbot renew")
  .version("0.1.0");

program
  .command("check", { isDefault: true })
  .description("Check TLS certificate expiry for all configured hosts and notify on warning/expired")
  .option("-c, --config <path>", "path to ssl-watch.config.json (overrides SSL_WATCH_CONFIG_PATH)")
  .action(async (opts: { config?: string }) => {
    await runCheck(opts.config);
  });

program
  .command("renew")
  .description("Run certbot renew (safe dry-run by default; pass --execute to renew for real)")
  .option("--execute", "actually renew certificates instead of performing a dry run", false)
  .action(async (opts: { execute: boolean }) => {
    await runRenew(opts.execute);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`[ssl-watch] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
