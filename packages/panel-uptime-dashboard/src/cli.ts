#!/usr/bin/env node
import { loadConfig, resolveConfigPath } from "./config.js";
import { initDatabase } from "./store.js";
import { startMonitoring } from "./monitor.js";
import { createServer } from "./server.js";

function main(): void {
  const configPath = resolveConfigPath();
  const targets = loadConfig(configPath);
  console.log(`${targets.length} hedef yüklendi (${configPath})`);

  const dbPath = process.env.UPTIME_DB_PATH ?? "./data/uptime.sqlite";
  const db = initDatabase(dbPath);
  console.log(`Veritabanı: ${dbPath}`);

  const intervalMs = Number(process.env.UPTIME_CHECK_INTERVAL_MS ?? 60000);
  const port = Number(process.env.PORT ?? 3000);

  startMonitoring(db, targets, intervalMs, (target, result) => {
    if (result.up) {
      console.log(`✓ ${target.name} çalışıyor (${result.responseTimeMs}ms)`);
    } else {
      console.log(`✗ ${target.name} çöktü${result.error ? ` (${result.error})` : ""}`);
    }
  });

  const server = createServer(db, targets);
  server.listen(port, () => {
    console.log(`Panel http://localhost:${port} adresinde çalışıyor (kontrol aralığı: ${intervalMs}ms)`);
  });
}

main();
