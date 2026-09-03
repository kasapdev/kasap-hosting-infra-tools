import { NginxParseError } from "./errors.js";

export type TokenKind =
  | "word"
  | "string"
  | "lbrace"
  | "rbrace"
  | "semicolon"
  | "comment"
  | "eof";

export interface Token {
  kind: TokenKind;
  /**
   * For "word": the raw bareword text.
   * For "string": the string content with surrounding quotes stripped and
   * basic backslash-escapes for the matching quote char resolved.
   * For "comment": the text following '#' up to (not including) the newline.
   * For braces/semicolon: the literal character. For "eof": "".
   */
  value: string;
  /** 1-based line number the token starts on. */
  line: number;
}

const WHITESPACE = new Set([" ", "\t", "\r", "\n"]);

const SPECIAL_SINGLE: Record<string, TokenKind> = {
  "{": "lbrace",
  "}": "rbrace",
  ";": "semicolon",
};

/**
 * Tokenizes nginx config source into a flat token stream. Comments are kept
 * as their own "comment" tokens (not attached to directives) so the parser
 * can freely skip them anywhere a token is expected, including trailing
 * same-line comments after a directive.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const len = source.length;
  let i = 0;
  let line = 1;

  while (i < len) {
    const ch = source[i] as string;

    if (ch === "\n") {
      line++;
      i++;
      continue;
    }

    if (WHITESPACE.has(ch)) {
      i++;
      continue;
    }

    if (ch === "#") {
      const startLine = line;
      let j = i + 1;
      let text = "";
      while (j < len && source[j] !== "\n") {
        text += source[j];
        j++;
      }
      tokens.push({ kind: "comment", value: text, line: startLine });
      i = j;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const startLine = line;
      let j = i + 1;
      let value = "";
      let closed = false;
      while (j < len) {
        const c = source[j] as string;
        if (c === "\\" && source[j + 1] === quote) {
          value += quote;
          j += 2;
          continue;
        }
        if (c === "\\" && source[j + 1] === "\\") {
          value += "\\";
          j += 2;
          continue;
        }
        if (c === quote) {
          closed = true;
          j++;
          break;
        }
        if (c === "\n") {
          line++;
        }
        value += c;
        j++;
      }
      if (!closed) {
        throw new NginxParseError(
          "Unterminated string literal",
          startLine
        );
      }
      tokens.push({ kind: "string", value, line: startLine });
      i = j;
      continue;
    }

    const special = SPECIAL_SINGLE[ch];
    if (special) {
      tokens.push({ kind: special, value: ch, line });
      i++;
      continue;
    }

    // Bareword: everything up to whitespace or a character that starts
    // another kind of token. nginx directive names/args can otherwise
    // contain almost anything (paths, URLs, regexes, etc).
    const startLine = line;
    let j = i;
    let value = "";
    while (j < len) {
      const c = source[j] as string;
      if (
        WHITESPACE.has(c) ||
        c === "{" ||
        c === "}" ||
        c === ";" ||
        c === "#" ||
        c === '"' ||
        c === "'"
      ) {
        break;
      }
      value += c;
      j++;
    }
    if (value.length === 0) {
      // Defensive: avoid an infinite loop on an unexpected character.
      j++;
    }
    tokens.push({ kind: "word", value, line: startLine });
    i = j;
  }

  tokens.push({ kind: "eof", value: "", line });
  return tokens;
}
