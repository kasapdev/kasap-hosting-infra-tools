import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { Target } from "./config.js";
import { getRecentChecks } from "./store.js";
import { uptimePercent, sparkline, currentStatus, type CheckRecord } from "./aggregate.js";

export interface TargetStatus {
  name: string;
  status: "up" | "down" | "unknown";
  uptimePercent: number | null;
  lastResponseTimeMs: number | null;
  sparkline: string;
  lastCheckedAt: string | null;
}

const HISTORY_LIMIT = 50;

/** Builds the current status summary for every configured target from stored history. */
export function computeStatuses(db: DatabaseSync, targets: Target[]): TargetStatus[] {
  return targets.map((target) => {
    const rows = getRecentChecks(db, target.name, HISTORY_LIMIT);
    const records: CheckRecord[] = rows.map((row) => ({
      up: row.up,
      responseTimeMs: row.responseTimeMs,
      checkedAt: row.checkedAt,
    }));
    const last = records[records.length - 1];

    return {
      name: target.name,
      status: currentStatus(records),
      uptimePercent: uptimePercent(records),
      lastResponseTimeMs: last?.responseTimeMs ?? null,
      sparkline: sparkline(records),
      lastCheckedAt: last?.checkedAt ?? null,
    };
  });
}

function renderPage(): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Berilis Uptime Panel</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    font-family: -apple-system, Segoe UI, Roboto, sans-serif;
    background: #0f1115;
    color: #e6e8eb;
    padding: 2rem 1.5rem;
  }
  h1 { font-size: 1.25rem; margin: 0 0 1.25rem; }
  table { width: 100%; max-width: 900px; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.6rem 0.8rem; border-bottom: 1px solid #2a2e37; }
  th { font-size: 0.75rem; text-transform: uppercase; color: #9aa1ac; letter-spacing: 0.04em; }
  .status { font-weight: 600; }
  .status-up { color: #3fd67f; }
  .status-down { color: #ff5c5c; }
  .status-unknown { color: #9aa1ac; }
  .spark { font-family: monospace; letter-spacing: 1px; }
  .muted { color: #9aa1ac; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>Berilis Uptime Panel</h1>
<table id="targets">
  <thead>
    <tr>
      <th>Hedef</th>
      <th>Durum</th>
      <th>Uptime</th>
      <th>Yanıt süresi</th>
      <th>Geçmiş</th>
      <th>Son kontrol</th>
    </tr>
  </thead>
  <tbody></tbody>
</table>
<p class="muted" id="empty" hidden>Henüz kontrol verisi yok.</p>
<script>
  function statusClass(status) {
    if (status === "up") return "status-up";
    if (status === "down") return "status-down";
    return "status-unknown";
  }

  function statusLabel(status) {
    if (status === "up") return "ÇALIŞIYOR";
    if (status === "down") return "ÇÖKTÜ";
    return "BİLİNMİYOR";
  }

  function render(rows) {
    var tbody = document.querySelector("#targets tbody");
    var empty = document.getElementById("empty");
    tbody.innerHTML = "";
    empty.hidden = rows.length > 0;

    rows.forEach(function (row) {
      var tr = document.createElement("tr");

      var uptime = row.uptimePercent === null ? "-" : row.uptimePercent.toFixed(1) + "%";
      var rt = row.lastResponseTimeMs === null ? "-" : row.lastResponseTimeMs + "ms";
      var checkedAt = row.lastCheckedAt === null ? "-" : new Date(row.lastCheckedAt).toLocaleString("tr-TR");

      tr.innerHTML =
        "<td>" + row.name + "</td>" +
        "<td class=\\"status " + statusClass(row.status) + "\\">" + statusLabel(row.status) + "</td>" +
        "<td>" + uptime + "</td>" +
        "<td>" + rt + "</td>" +
        "<td class=\\"spark\\">" + (row.sparkline || "-") + "</td>" +
        "<td>" + checkedAt + "</td>";
      tbody.appendChild(tr);
    });
  }

  function refresh() {
    fetch("/api/status")
      .then(function (res) { return res.json(); })
      .then(render)
      .catch(function (err) { console.error("status alınamadı:", err); });
  }

  refresh();
  setInterval(refresh, 15000);
</script>
</body>
</html>`;
}

/**
 * Builds (but does not start listening on) the HTTP server. Callers control
 * `listen()` so tests can bind to an ephemeral port.
 */
export function createServer(db: DatabaseSync, targets: Target[]): Server {
  return createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";

    if (url === "/api/status") {
      const statuses = computeStatuses(db, targets);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(statuses));
      return;
    }

    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderPage());
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });
}
