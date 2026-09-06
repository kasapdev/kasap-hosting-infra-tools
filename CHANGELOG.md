# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
