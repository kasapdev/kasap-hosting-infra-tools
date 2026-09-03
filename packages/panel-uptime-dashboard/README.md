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

## Data storage

Check history is stored in a SQLite file at `UPTIME_DB_PATH` (default `./data/uptime.sqlite`,
created automatically). This path is gitignored — don't commit it.

## Programmatic use

The package also exports its pieces for reuse (`config`, `checker`, `store`, `aggregate`,
`server`, `monitor`) via `@kasap/panel-uptime-dashboard` — see `src/index.ts`.
