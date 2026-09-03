import { tokenize, type Token } from "./lexer.js";
import { NginxParseError } from "./errors.js";

export { NginxParseError } from "./errors.js";

export interface Directive {
  type: "directive";
  name: string;
  args: string[];
  line: number;
}

export interface Block {
  type: "block";
  name: string;
  args: string[];
  children: Node[];
  line: number;
}

export type Node = Directive | Block;

export interface ConfigFile {
  type: "config";
  children: Node[];
}

/**
 * Hand-written recursive-descent parser for nginx config syntax.
 *
 * Grammar (informal):
 *   config     := statement*
 *   statement  := word+ ';'              (directive)
 *              |  word+ '{' statement* '}'  (block)
 * "word" here means a "word" or "string" token; comments are transparently
 * skipped wherever a token is expected.
 */
class Parser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseConfig(): ConfigFile {
    const children = this.parseStatements("eof");
    return { type: "config", children };
  }

  /** Returns the next non-comment token without consuming it. */
  private current(): Token {
    while (this.tokens[this.pos]?.kind === "comment") {
      this.pos++;
    }
    const tok = this.tokens[this.pos];
    if (!tok) {
      // Should be unreachable: the token stream always ends with "eof" and
      // callers never advance past it.
      throw new NginxParseError("Unexpected end of input", this.lastLine());
    }
    return tok;
  }

  private advance(): Token {
    const tok = this.current();
    this.pos++;
    return tok;
  }

  private lastLine(): number {
    const last = this.tokens[this.tokens.length - 1];
    return last ? last.line : 0;
  }

  private parseStatements(terminator: "eof" | "rbrace"): Node[] {
    const nodes: Node[] = [];
    while (true) {
      const tok = this.current();
      if (tok.kind === "eof") {
        if (terminator === "rbrace") {
          throw new NginxParseError(
            "Unexpected end of file, expected '}'",
            tok.line
          );
        }
        break;
      }
      if (tok.kind === "rbrace") {
        if (terminator === "rbrace") {
          break;
        }
        throw new NginxParseError("Unexpected '}' with no matching '{'", tok.line);
      }
      nodes.push(this.parseStatement());
    }
    return nodes;
  }

  private parseStatement(): Node {
    const nameTok = this.current();
    if (nameTok.kind !== "word" && nameTok.kind !== "string") {
      throw new NginxParseError(
        `Unexpected token '${nameTok.value}', expected a directive or block name`,
        nameTok.line
      );
    }
    this.advance();
    const name = nameTok.value;
    const line = nameTok.line;
    const args: string[] = [];

    while (true) {
      const tok = this.current();

      if (tok.kind === "semicolon") {
        this.advance();
        return { type: "directive", name, args, line };
      }

      if (tok.kind === "lbrace") {
        this.advance();
        const children = this.parseStatements("rbrace");
        const closing = this.current();
        if (closing.kind !== "rbrace") {
          throw new NginxParseError("Expected '}'", closing.line);
        }
        this.advance();
        return { type: "block", name, args, children, line };
      }

      if (tok.kind === "word" || tok.kind === "string") {
        this.advance();
        args.push(tok.value);
        continue;
      }

      if (tok.kind === "eof") {
        throw new NginxParseError(
          `Unexpected end of file, expected ';' or '{' after directive '${name}'`,
          tok.line
        );
      }

      // Only remaining case: an unexpected '}' encountered while still
      // collecting a directive's args/name, i.e. a missing terminating ';'.
      throw new NginxParseError(
        `Unexpected '}' before ';' in directive '${name}'`,
        tok.line
      );
    }
  }
}

export function parseNginxConfig(source: string): ConfigFile {
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parseConfig();
}
