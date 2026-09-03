# @kasap/cpanel-migrate-helper

CLI toolkit for cPanel-to-cPanel account migrations (Berilis shared hosting). It automates the
parts of a migration that are safely portable and don't require running real cPanel scripts
(`/scripts/pkgacct`, `/scripts/restorepkg`, etc.):

- **`pack`** — pack an account's home directory into a real, valid gzip-compressed tar archive and
  checksum it.
- **`plan`** — turn an accounts list (CSV or JSON) into a readable, ordered migration runbook with
  ready-to-copy `rsync`/`scp` commands.

## This tool never touches your servers

`cpanel-migrate-helper` **never executes remote commands**. It does not shell out to `ssh`,
`rsync`, `scp`, or any cPanel script. `pack` and `checksum` operate only on the local filesystem
(the directory/archive path you pass in). `plan` only *generates command strings as text* for a
human operator to review and run themselves — by hand, or by pasting into your own authorized
deployment tooling. This mirrors how a hosting operator actually works during a live migration:
generate the plan, review it, then run each step deliberately.

## Install / run

Inside the monorepo:

```sh
pnpm --filter @kasap/cpanel-migrate-helper build
node packages/cpanel-migrate-helper/dist/cli.js --help
```

Or during development:

```sh
pnpm --filter @kasap/cpanel-migrate-helper dev -- pack ./some/account/dir ./out/account_backup.tar.gz
```

## `pack` — archive + checksum an account directory

```sh
cpanel-migrate-helper pack /home/someuser ./backups/someuser_backup.tar.gz --verify
```

- Recursively archives `/home/someuser` into `./backups/someuser_backup.tar.gz` (gzip-compressed
  tar, built with the real `tar` package — the output is a normal `.tar.gz` any tool can extract).
- Prints one progress line per file/directory entry as the archive is built.
- Writes an `md5sum`-compatible checksum file alongside it:
  `./backups/someuser_backup.tar.gz.md5`.
- `--verify` immediately re-reads the archive and re-hashes it against the checksum file, so you
  catch a truncated/corrupt archive before shipping it anywhere.

Example output:

```
Packing "/home/someuser" -> "./backups/someuser_backup.tar.gz" ...
  [1] someuser
  [2] someuser/public_html
  [3] someuser/public_html/index.html
  [4] someuser/mail
Packed 4 entries into "./backups/someuser_backup.tar.gz".
Checksum written: ./backups/someuser_backup.tar.gz.md5
  a3f9c1e2b4d5e6f7a8b9c0d1e2f3a4b5  someuser_backup.tar.gz
Verification: OK
```

## `plan` — generate a migration runbook

Accepts a `.csv` or `.json` accounts file (detected by extension). See
[`accounts.example.csv`](./accounts.example.csv) for the CSV shape:

```csv
username,sourceHost,destHost,homeDir,diskUsageMb,destUser
acmeshop,src1.example-hosting.internal,dst1.example-hosting.internal,/home/acmeshop,12400,
blogtest,src1.example-hosting.internal,dst2.example-hosting.internal,/home/blogtest,320,
mailhost1,src2.example-hosting.internal,dst1.example-hosting.internal,/home/mailhost1,4850,mailhost1_new
photosite,src2.example-hosting.internal,dst2.example-hosting.internal,/home/photosite,900,
```

The equivalent JSON shape is an array of the same fields (`destUser` optional):

```json
[
  {
    "username": "blogtest",
    "sourceHost": "src1.example-hosting.internal",
    "destHost": "dst2.example-hosting.internal",
    "homeDir": "/home/blogtest",
    "diskUsageMb": 320
  }
]
```

Run it:

```sh
cpanel-migrate-helper plan ./accounts.example.csv
```

Accounts are ordered **smallest `diskUsageMb` first**: small accounts finish quickly, so they
surface connectivity, permission, quota, or DNS-cutover problems early — while there's still
plenty of the migration window left to fix them — instead of discovering a problem only after
committing hours to the largest account's transfer.

Sample output (abridged):

```
========================================================================
REMINDER: This runbook only PRINTS commands — nothing here has been run.
Review every step below and execute the commands yourself (or via an
authorized deployment channel) before touching any production account.
========================================================================

cPanel Migration Runbook — 4 account(s), ordered smallest disk usage first

Step 1/4: blogtest (320 MB)
  Source: src1.example-hosting.internal:/home/blogtest
  Dest:   blogtest@dst2.example-hosting.internal:/home/blogtest
  rsync:  rsync -avz --progress -e "ssh -p 22" src1.example-hosting.internal:/home/blogtest/ blogtest@dst2.example-hosting.internal:/home/blogtest/
  scp (fallback, packed archive): scp src1.example-hosting.internal:/home/blogtest/blogtest_backup.tar.gz dst2.example-hosting.internal:/home/

Step 2/4: photosite (900 MB)
  ...

Step 3/4: mailhost1 (4850 MB)
  Source: src2.example-hosting.internal:/home/mailhost1
  Dest:   mailhost1_new@dst1.example-hosting.internal:/home/mailhost1
  rsync:  rsync -avz --progress -e "ssh -p 22" src2.example-hosting.internal:/home/mailhost1/ mailhost1_new@dst1.example-hosting.internal:/home/mailhost1/
  scp (fallback, packed archive): scp src2.example-hosting.internal:/home/mailhost1/mailhost1_backup.tar.gz dst1.example-hosting.internal:/home/

Step 4/4: acmeshop (12400 MB)
  ...
========================================================================
```

Flags:

- `--json` — print the runbook as JSON instead of plain text (useful for feeding into other
  tooling).
- `-o, --output <file>` — write the rendered runbook to a file instead of stdout.

```sh
cpanel-migrate-helper plan ./accounts.example.csv --json -o ./runbook.json
```

## Programmatic API

```ts
import {
  packDirectory,
  writeChecksumFile,
  verifyChecksumFile,
  parseAccountsCsv,
  parseAccountsJson,
  buildRunbook,
  formatRunbookText,
  formatRunbookJson,
} from "@kasap/cpanel-migrate-helper";
```

All functions are pure data-in/data-out (or local-filesystem-in/out for `pack`/`checksum`) —
none of them execute remote commands.
