/**
 * Thrown by the lexer/parser when nginx config source cannot be tokenized or
 * parsed. Always carries the 1-based line number where the problem was
 * detected so callers (CLI, lint findings) can point the user at it.
 */
export class NginxParseError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = "NginxParseError";
    this.line = line;
  }
}
