# kasap-hosting-infra-tools

Small, genuinely working infrastructure tools for shared/cPanel hosting and
game-server (Minecraft/FiveM/MTA) hosting operations, built by
[kasapdev](https://github.com/kasapdev). Companion repo to
[kasap-ai-tools](https://github.com/kasapdev/kasap-ai-tools), mirroring the
same pnpm + TypeScript workspace conventions.

## Packages

| Package | Description |
| --- | --- |
| [`panel-uptime-dashboard`](packages/panel-uptime-dashboard) | Self-hosted uptime monitor: HTTP(S)/TCP checks on an interval, SQLite history, and a small dashboard page with per-target uptime % and sparklines. |
| [`cpanel-migrate-helper`](packages/cpanel-migrate-helper) | CLI to pack an account's home directory into a checksummed tar.gz archive and generate an ordered, human-reviewable migration runbook (scp/rsync commands) from a CSV/JSON account list. |
| [`ssl-auto-renew-watcher`](packages/ssl-auto-renew-watcher) | Checks TLS certificate expiry for a list of hosts, optionally drives `certbot renew` (dry-run by default), and sends console/Discord/Slack notifications. |
| [`nginx-config-linter`](packages/nginx-config-linter) | Recursive-descent parser for nginx config syntax plus a security/performance lint rule engine, with `--json` output. |

## Development

This is a pnpm workspace.

```bash
pnpm install
pnpm -r build
pnpm -r typecheck
pnpm -r test
```

Requires Node.js >= 22.5.0 (uses `node:sqlite`) and pnpm 11.

## License

MIT © Kayra Kasapoğlu
