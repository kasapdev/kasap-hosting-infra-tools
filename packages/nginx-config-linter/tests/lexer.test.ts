import { describe, expect, it } from "vitest";
import { tokenize } from "../src/lexer.js";

describe("tokenize", () => {
  it("tokenizes a simple directive", () => {
    const tokens = tokenize("worker_processes auto;\n");
    expect(tokens.map((t) => [t.kind, t.value])).toEqual([
      ["word", "worker_processes"],
      ["word", "auto"],
      ["semicolon", ";"],
      ["eof", ""],
    ]);
  });

  it("tracks line numbers across newlines", () => {
    const tokens = tokenize("a;\nb;\nc;");
    const lines = tokens.filter((t) => t.kind === "word").map((t) => t.line);
    expect(lines).toEqual([1, 2, 3]);
  });

  it("tokenizes blocks with braces", () => {
    const tokens = tokenize("server {\n  listen 80;\n}");
    expect(tokens.map((t) => t.kind)).toEqual([
      "word",
      "lbrace",
      "word",
      "word",
      "semicolon",
      "rbrace",
      "eof",
    ]);
  });

  it("tokenizes double-quoted strings and strips the quotes", () => {
    const tokens = tokenize(`add_header X-Test "hello world";`);
    const stringTok = tokens.find((t) => t.kind === "string");
    expect(stringTok?.value).toBe("hello world");
  });

  it("tokenizes single-quoted strings", () => {
    const tokens = tokenize(`foo 'bar baz';`);
    const stringTok = tokens.find((t) => t.kind === "string");
    expect(stringTok?.value).toBe("bar baz");
  });

  it("handles escaped matching quotes inside a quoted string", () => {
    const tokens = tokenize(`foo "she said \\"hi\\"";`);
    const stringTok = tokens.find((t) => t.kind === "string");
    expect(stringTok?.value).toBe('she said "hi"');
  });

  it("captures comments as their own token, to end of line", () => {
    const tokens = tokenize("foo bar; # this is a comment\nbaz;");
    const commentTok = tokens.find((t) => t.kind === "comment");
    expect(commentTok?.value).toBe(" this is a comment");
    expect(commentTok?.line).toBe(1);
    // The comment must not be absorbed into the preceding directive's args.
    const wordValues = tokens.filter((t) => t.kind === "word").map((t) => t.value);
    expect(wordValues).toEqual(["foo", "bar", "baz"]);
  });

  it("records an empty quoted string's value and line correctly", () => {
    const tokens = tokenize(`x "";`);
    const stringTok = tokens.find((t) => t.kind === "string");
    expect(stringTok?.value).toBe("");
    expect(stringTok?.line).toBe(1);
  });
});
