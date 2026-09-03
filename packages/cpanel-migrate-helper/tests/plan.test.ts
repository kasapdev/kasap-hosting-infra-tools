import { describe, expect, it } from "vitest";
import {
  buildRunbook,
  formatRunbookJson,
  formatRunbookText,
  parseAccountsCsv,
  parseAccountsJson,
  type RunbookStep,
} from "../src/plan.js";

const CSV_SAMPLE = `username,sourceHost,destHost,homeDir,diskUsageMb,destUser
bigsite,src1.example-hosting.internal,dst1.example-hosting.internal,/home/bigsite,8200,
smallsite,src1.example-hosting.internal,dst1.example-hosting.internal,/home/smallsite,150,smallsite_new
"quoted,user",src2.example-hosting.internal,dst2.example-hosting.internal,/home/quoteduser,900,
`;

const JSON_SAMPLE = JSON.stringify([
  {
    username: "jsonuser",
    sourceHost: "src3.example-hosting.internal",
    destHost: "dst3.example-hosting.internal",
    homeDir: "/home/jsonuser",
    diskUsageMb: 400,
  },
]);

describe("parseAccountsCsv", () => {
  it("parses rows including a quoted field with an embedded comma", () => {
    const accounts = parseAccountsCsv(CSV_SAMPLE);
    expect(accounts).toHaveLength(3);

    const quotedUser = accounts.find((a) => a.username === "quoted,user");
    expect(quotedUser).toBeDefined();
    expect(quotedUser?.diskUsageMb).toBe(900);

    const smallsite = accounts.find((a) => a.username === "smallsite");
    expect(smallsite?.destUser).toBe("smallsite_new");
    expect(smallsite?.diskUsageMb).toBe(150);

    const bigsite = accounts.find((a) => a.username === "bigsite");
    expect(bigsite?.destUser).toBeUndefined();
  });

  it("throws on missing required columns", () => {
    expect(() => parseAccountsCsv("username,sourceHost\nfoo,bar\n")).toThrow();
  });

  it("throws on a non-numeric diskUsageMb", () => {
    const badCsv = "username,sourceHost,destHost,homeDir,diskUsageMb\nfoo,src,dst,/home/foo,not-a-number\n";
    expect(() => parseAccountsCsv(badCsv)).toThrow();
  });
});

describe("parseAccountsJson", () => {
  it("parses a valid JSON array", () => {
    const accounts = parseAccountsJson(JSON_SAMPLE);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.username).toBe("jsonuser");
    expect(accounts[0]?.diskUsageMb).toBe(400);
  });

  it("throws on entries missing required fields", () => {
    expect(() => parseAccountsJson(JSON.stringify([{ username: "x" }]))).toThrow();
  });

  it("throws on malformed JSON", () => {
    expect(() => parseAccountsJson("not json")).toThrow();
  });

  it("throws when the top level is not an array", () => {
    expect(() => parseAccountsJson(JSON.stringify({ not: "an array" }))).toThrow();
  });
});

describe("buildRunbook", () => {
  it("orders accounts by diskUsageMb ascending and generates real rsync/scp commands", () => {
    const accounts = parseAccountsCsv(CSV_SAMPLE);
    const steps = buildRunbook(accounts);

    expect(steps.map((s) => s.username)).toEqual(["smallsite", "quoted,user", "bigsite"]);
    expect(steps[0]?.position).toBe(1);
    expect(steps[steps.length - 1]?.position).toBe(steps.length);
    expect(steps.every((s) => s.totalSteps === steps.length)).toBe(true);

    const smallStep = steps[0] as RunbookStep;
    expect(smallStep.rsyncCommand).toContain("rsync -avz --progress");
    expect(smallStep.rsyncCommand).toContain("src1.example-hosting.internal:/home/smallsite/");
    expect(smallStep.rsyncCommand).toContain("smallsite_new@dst1.example-hosting.internal:/home/smallsite/");
    expect(smallStep.scpCommand).toBe(
      "scp src1.example-hosting.internal:/home/smallsite/smallsite_backup.tar.gz dst1.example-hosting.internal:/home/",
    );
  });
});

describe("formatRunbookText / formatRunbookJson", () => {
  it("produces a readable, non-empty text runbook with a manual-review reminder", () => {
    const accounts = parseAccountsJson(JSON_SAMPLE);
    const steps = buildRunbook(accounts);
    const text = formatRunbookText(steps);

    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("jsonuser");
    expect(text.toLowerCase()).toContain("review");
  });

  it("produces valid, parseable JSON output with the expected step count", () => {
    const accounts = parseAccountsJson(JSON_SAMPLE);
    const steps = buildRunbook(accounts);
    const json = formatRunbookJson(steps);

    const parsed = JSON.parse(json) as { stepCount: number; steps: unknown[] };
    expect(Array.isArray(parsed.steps)).toBe(true);
    expect(parsed.steps).toHaveLength(steps.length);
    expect(parsed.stepCount).toBe(steps.length);
  });
});
