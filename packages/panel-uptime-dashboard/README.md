# @kasap/panel-uptime-dashboard

A minimal, self-hosted uptime dashboard for monitoring cPanel/game-server endpoints
(HTTP or raw TCP). No external services, no frontend framework — a Node HTTP server,
a SQLite history file, and a vanilla-JS status page.

## Install & configure

From the repo root:

```sh
pnpm install
```

Copy the example target list and edit it with your real endpoints:

```sh
cp packages/panel-uptime-dashboard/uptime.config.example.json packages/panel-uptime-dashboard/uptime.config.json
```

Each entry is either an `http` or `tcp` target:

```json
{ "name": "cpanel-web1", "type": "http", "url": "https://panel.example.com:2083", "timeoutMs": 5000 }
{ "name": "mc-survival", "type": "tcp", "host": "mc.example.com", "port": 25565, "timeoutMs": 3000 }
```

`timeoutMs` is optional (defaults to 5000ms). `http` targets require `url`; `tcp` targets
require `host` and `port`. Bad config throws a clear error at startup.

Optionally copy `.env.example` to `.env` (or just export the variables) to override
defaults — see that file for `PORT`, `UPTIME_CHECK_INTERVAL_MS`, `UPTIME_DB_PATH`,
and `UPTIME_CONFIG_PATH`.

## Run

```sh
pnpm --filter @kasap/panel-uptime-dashboard dev
```

Then open `http://localhost:3000`. The page polls `/api/status` every 15s and renders
a table with per-target status, uptime %, last response time, and a text sparkline of
recent checks.

For production use, build and run the compiled CLI:

```sh
pnpm --filter @kasap/panel-uptime-dashboard build
node packages/panel-uptime-dashboard/dist/cli.js
```

## `/api/status` shape

```json
[
  {
    "name": "cpanel-web1",
    "status": "up",
    "uptimePercent": 99.2,
    "lastResponseTimeMs": 118,
    "sparkline": "▂▁▂▃▁▂▂▁▃▂",
    "lastCheckedAt": "2026-09-04T12:00:00.000Z"
  }
]
```

- `status` is `"up"`, `"down"`, or `"unknown"` (no history yet).
- `uptimePercent` is `null` when there's no history yet.
- `sparkline` renders down checks as `_`, and up checks as a block character scaled by
  response time relative to the min/max seen in the recent window (fastest = shortest bar).

## Incident history

Beyond the live `uptimePercent` summary, the package computes discrete **incidents** —
each contiguous run of down checks — from a target's stored check history. This turns
"is it up right now" into "when did it go down, when did it come back, and how long
was that": exactly what you need for an incident report or an SLA calculation.

`incidentHistory(checks)` (exported from `src/aggregate.ts`) takes checks ordered
oldest-first (each requiring a `checkedAt` timestamp — this is the one aggregate
function where timestamps aren't optional, since duration is meaningless without them)
and returns one entry per down run:

```ts
import { incidentHistory } from "@kasap/panel-uptime-dashboard";

const incidents = incidentHistory([
  { up: true, checkedAt: "2026-09-08T10:00:00.000Z" },
  { up: false, checkedAt: "2026-09-08T10:01:00.000Z" },
  { up: false, checkedAt: "2026-09-08T10:02:00.000Z" },
  { up: true, checkedAt: "2026-09-08T10:03:00.000Z" },
  { up: false, checkedAt: "2026-09-08T10:04:00.000Z" }, // still down as of the last check
]);

// [
//   {
//     startedAt: "2026-09-08T10:01:00.000Z",
//     endedAt: "2026-09-08T10:03:00.000Z",
//     durationMs: 120000,
//     downChecks: 2
//   },
//   {
//     startedAt: "2026-09-08T10:04:00.000Z",
//     endedAt: null,        // ongoing — target was still down at the last check
//     durationMs: null,      // no known end, so no duration to report
//     downChecks: 1
//   }
// ]
```

An incident's `endedAt` is the timestamp of the check that confirmed recovery (the
first `up` check after the down run). If history ends while the target is still down,
the last incident is returned with `endedAt: null` and `durationMs: null` — it's
ongoing, and a pure function has no business guessing "now" as a fake end time.

This is also wired into the dashboard server as `GET /api/incidents?target=<name>`:

```sh
curl "http://localhost:3000/api/incidents?target=cpanel-web1"
```

Returns `400` if `target` is missing, `404` if it isn't a configured target, otherwise
`200` with the JSON array of incidents described above (using the same `HISTORY_LIMIT`
window as `/api/status`).

## Data storage

Check history is stored in a SQLite file at `UPTIME_DB_PATH` (default `./data/uptime.sqlite`,
created automatically). This path is gitignored — don't commit it.

## Programmatic use

The package also exports its pieces for reuse (`config`, `checker`, `store`, `aggregate`,
`server`, `monitor`) via `@kasap/panel-uptime-dashboard` — see `src/index.ts`.
