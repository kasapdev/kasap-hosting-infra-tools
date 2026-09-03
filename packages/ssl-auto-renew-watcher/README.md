# @kasap/ssl-auto-renew-watcher

Watches TLS certificate expiry across customer domains and optionally drives
`certbot renew`, notifying operators via console/Discord/Slack.

## Setup

1. Copy the example host list and edit it with the domains you want watched:

   ```bash
   cp ssl-watch.config.example.json ssl-watch.config.json
   ```

   Each entry is `{ "host": string, "port"?: number }` (`port` defaults to `443`):

   ```json
   [
     { "host": "example.com", "port": 443 },
     { "host": "shop.example.com" }
   ]
   ```

2. Copy `.env.example` to `.env` and fill in what you need:

   ```bash
   cp .env.example .env
   ```

   | Variable | Default | Purpose |
   | --- | --- | --- |
   | `SSL_WARNING_DAYS` | `14` | Days-remaining threshold below which a host is reported as `warning`. |
   | `DISCORD_WEBHOOK_URL` | _(unset)_ | Discord incoming webhook to notify on `warning`/`expired` hosts or renewal failures. Leave empty to disable. |
   | `SLACK_WEBHOOK_URL` | _(unset)_ | Slack incoming webhook, same purpose. Leave empty to disable. |
   | `SSL_WATCH_CONFIG_PATH` | `./ssl-watch.config.json` | Path to the host list file. Overridable per-invocation with `--config`. |

## Usage

### Check certificate expiry

```bash
ssl-auto-renew-watcher check
# or explicitly:
ssl-auto-renew-watcher check --config ./ssl-watch.config.json
```

For every configured host this opens a real TLS connection, reads the peer
certificate, and prints a report of days remaining and status
(`OK` / `WARNING` / `EXPIRED`). Any host in `WARNING` or `EXPIRED` state (or
one that failed to connect) triggers a notification via `notifyAll` —
console always, plus any configured webhooks.

### Renew certificates

```bash
ssl-auto-renew-watcher renew            # dry run (safe, default)
ssl-auto-renew-watcher renew --execute  # actually renews certificates
```

**Dry-run by default.** Unless you pass `--execute`, this command runs
`certbot renew --dry-run` — it validates that renewal *would* succeed
without touching any real certificate. Only `--execute` runs the real
`certbot renew`. This default is intentional and safety-critical: it means
running the command (or wiring it into a cron job / CI pipeline) without
extra flags can never mutate production certificates.

If `certbot` isn't found on `PATH`, the command prints a clear message and
exits cleanly (no crash).

The renewal output is parsed into succeeded/failed/skipped cert lineages and
summarized on the console; any failures trigger a webhook/console
notification the same way `check` does.

## Webhook setup

- **Discord**: create an incoming webhook under a channel's *Integrations*
  settings and set `DISCORD_WEBHOOK_URL` to it. Messages are posted as
  `{ "content": "<message>" }`.
- **Slack**: create an incoming webhook app and set `SLACK_WEBHOOK_URL` to
  it. Messages are posted as `{ "text": "<message>" }`.

Both are optional and independent — configure one, both, or neither (console
notifications always happen regardless).

## Development

```bash
pnpm --filter @kasap/ssl-auto-renew-watcher dev -- check
pnpm --filter @kasap/ssl-auto-renew-watcher test
pnpm --filter @kasap/ssl-auto-renew-watcher build
```

All TLS connections, certbot process invocations, and outbound webhook
`fetch` calls are injectable in the underlying functions
(`connectFn`, `execFn`, `fetchImpl`), so the test suite never opens a real
network connection or spawns a real `certbot` process.
