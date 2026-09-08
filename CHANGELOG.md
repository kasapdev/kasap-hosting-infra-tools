# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## 2026-09-08

### Added

- `packages/panel-uptime-dashboard` (0.1.0 → 0.2.0): new `incidentHistory()`
  aggregate function in `src/aggregate.ts` — groups a target's check history
  into discrete incidents (contiguous down runs), each with `startedAt`,
  `endedAt`, `durationMs`, and `downChecks`. An incident still down at the end
  of the supplied history is reported as ongoing (`endedAt`/`durationMs: null`)
  rather than guessing an end time. Wired into the dashboard server as a new
  `GET /api/incidents?target=<name>` route (`400` for a missing `target`,
  `404` for an unconfigured one). Documented with a runnable example in the
  package README under a new "Incident history" section.
- `packages/panel-uptime-dashboard`: 15 new tests — `incidentHistory` covering
  empty history, all-up, all-down, a single up/down check, a closed incident
  with correct duration, an incident still ongoing at the end of history,
  two incidents separated by a recovery check, adjacent down checks merging
  into one incident (never double-counted), and incident ordering; plus
  `server.ts` coverage for the new `/api/incidents` route and for a
  previously-untested gap — a configured target with zero recorded checks
  (confirmed `computeStatuses` already returns `unknown`/`null` correctly for
  it, and that `/index.html` serves the same page as `/`).

### Changed

- `packages/panel-uptime-dashboard`: bumped to `0.2.0` (minor) for the new
  `incidentHistory` feature and `/api/incidents` endpoint.

## 2026-09-06

### Added

- `packages/cpanel-migrate-helper`: test coverage for `checksum.ts` edge cases
  — case-insensitive digest comparison in `verifyChecksumFile` (an upper-case
  digest in the `.md5` file), and empty/blank checksum files being reported
  as a verification failure rather than throwing.
- `packages/cpanel-migrate-helper`: test coverage for `plan.ts` edge cases
  — `parseAccountsCsv` throwing on completely empty/blank CSV input,
  `parseAccountsCsv` returning `[]` for a header-only CSV with no data rows,
  and `formatRunbookText` / `formatRunbookJson` rendering a proper
  "no accounts to migrate" message and `stepCount: 0` for an empty runbook
  instead of an empty/broken document.
- `packages/panel-uptime-dashboard`: test coverage for `aggregate.ts`'s
  `sparkline` when `up` checks carry no `responseTimeMs` at all (renders the
  tallest bar for every check, never the down-marker) and when only some
  `up` checks in the window are missing `responseTimeMs` (they render tied
  with the window's fastest response, documenting existing fallback
  behavior).

All of the above are new test cases only; no source-code behavior changed
because every case already behaved correctly.
