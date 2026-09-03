# @kasap/nginx-config-linter

A CLI that parses real nginx configuration syntax into an AST with a genuine
recursive-descent parser (no regex hacks), then runs a set of lint rules
against that AST to catch common security and correctness issues before a
config is deployed.

## Install / build

This package lives in a pnpm workspace. From the repo root:

```sh
pnpm install
pnpm --filter @kasap/nginx-config-linter build
```

## Usage

```sh
nginx-config-linter ./nginx.conf
```

```sh
nginx-config-linter ./nginx.conf --json
```

During development (no build needed):

```sh
pnpm --filter @kasap/nginx-config-linter dev -- ./nginx.conf
```

### Sample text output

```
./nginx.conf
SECURITY  line 1   [server-tokens-off]  No 'server_tokens off;' directive found anywhere in the config; nginx will disclose its version in error pages and the Server header.
WARNING   line 3   [duplicate-listen-without-default-server]  Port 80 has 2 'listen' directives but none is marked 'default_server'; which server block handles unmatched requests on this port is ambiguous.
SECURITY  line 17  [ssl-protocols-deprecated]  Deprecated SSL/TLS protocol(s) enabled: TLSv1, TLSv1.1.
INFO      line 2   [client-max-body-size-missing]  server block has no 'client_max_body_size' directive set directly within it.

2 security, 1 warning, 1 info
```

### Exit codes

The CLI exits with code `1` if the config fails to parse, or if any finding
has severity `security`. Otherwise it exits `0`. This makes it safe to drop
into a CI or pre-deploy pipeline as a hard gate on security issues, while
`info`/`warning` findings are surfaced without failing the build.

## Rules

| Rule | Severity | Description |
| --- | --- | --- |
| `server-tokens-off` | security | Flags the config if no `server_tokens off;` directive exists anywhere in the tree, which otherwise leaks the nginx version in error pages and the `Server` header. |
| `client-max-body-size-missing` | info | Flags each `server { ... }` block that has no `client_max_body_size` directive among its own direct children. |
| `ssl-protocols-deprecated` | security | Flags every `ssl_protocols` directive whose args include the deprecated `TLSv1` or `TLSv1.1`. |
| `security-headers-missing` | info | For every `server` or `location` block, flags each of `add_header X-Frame-Options ...;` and `add_header X-Content-Type-Options ...;` that is missing from that block's own direct children (one finding per missing header per block). |
| `duplicate-listen-without-default-server` | warning | Groups all `listen` directives by resolved port number (handling `host:port` and bracketed IPv6 forms); flags any port with more than one `listen` directive where none carries the `default_server` flag, since routing for that port is then ambiguous. |
| `autoindex-on-unrestricted` | warning | Flags every `autoindex on;` directive. As a simplification, a finding is skipped only when the *same* block also directly contains an `allow` or `deny` directive; access control set only in a parent block is not detected, so this rule is deliberately conservative. |

## Architecture

- `src/lexer.ts` — tokenizer producing `word`, `string`, `{`, `}`, `;`, and
  `comment` tokens, each with a 1-based line number.
- `src/parser.ts` — a hand-written recursive-descent parser that turns the
  token stream into a `ConfigFile` AST of `Directive`/`Block` nodes,
  handling arbitrary nesting depth and throwing `NginxParseError` (with a
  line number) on malformed input.
- `src/rules/` — one file per lint rule, each a pure `(ast) => Finding[]`
  function; `src/rules/index.ts` exports `runAllRules`.
- `src/format.ts` — human-readable and JSON output formatting.
- `src/cli.ts` — the `nginx-config-linter` command.

## Programmatic API

```ts
import { parseNginxConfig, runAllRules, formatText } from "@kasap/nginx-config-linter";

const ast = parseNginxConfig(source);
const findings = runAllRules(ast);
console.log(formatText(findings));
```
