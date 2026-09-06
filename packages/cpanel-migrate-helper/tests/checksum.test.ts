import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeMd5, verifyChecksumFile, writeChecksumFile } from "../src/checksum.js";

describe("checksum", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    const dirs = tempDirs.splice(0);
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "cpanel-migrate-checksum-"));
    tempDirs.push(dir);
    return dir;
  }

  it("computes the correct md5 for known content, matching an independently computed digest", async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, "hello.txt");
    await writeFile(filePath, "hello world", "utf8");

    // Independently computed expected digest (not derived from the function under test).
    const independentDigest = createHash("md5").update("hello world").digest("hex");
    expect(independentDigest).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3");

    const actual = await computeMd5(filePath);
    expect(actual).toBe(independentDigest);
    expect(actual).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3");
  });

  it("writes a md5sum-compatible checksum file", async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, "archive.tar.gz");
    await writeFile(filePath, "some archive bytes", "utf8");

    const checksumFilePath = await writeChecksumFile(filePath);
    expect(checksumFilePath).toBe(`${filePath}.md5`);

    const content = await readFile(checksumFilePath, "utf8");
    const expectedDigest = createHash("md5").update("some archive bytes").digest("hex");
    expect(content).toBe(`${expectedDigest}  archive.tar.gz\n`);
  });

  it("verifies an unmodified file as valid and a mutated file as invalid", async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, "payload.bin");
    await writeFile(filePath, "original content", "utf8");

    const checksumFilePath = await writeChecksumFile(filePath);
    expect(await verifyChecksumFile(filePath, checksumFilePath)).toBe(true);

    await writeFile(filePath, "mutated content", "utf8");
    expect(await verifyChecksumFile(filePath, checksumFilePath)).toBe(false);
  });

  it("verifies a checksum file with an upper-case digest case-insensitively", async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, "payload.bin");
    await writeFile(filePath, "original content", "utf8");

    const digest = await computeMd5(filePath);
    const checksumFilePath = join(dir, "payload.bin.md5");
    await writeFile(checksumFilePath, `${digest.toUpperCase()}  payload.bin\n`, "utf8");

    expect(await verifyChecksumFile(filePath, checksumFilePath)).toBe(true);
  });

  it("returns false (not throws) when the checksum file is empty or blank", async () => {
    const dir = await makeTempDir();
    const filePath = join(dir, "payload.bin");
    await writeFile(filePath, "original content", "utf8");

    const emptyChecksumFilePath = join(dir, "empty.md5");
    await writeFile(emptyChecksumFilePath, "", "utf8");
    expect(await verifyChecksumFile(filePath, emptyChecksumFilePath)).toBe(false);

    const blankChecksumFilePath = join(dir, "blank.md5");
    await writeFile(blankChecksumFilePath, "   \n", "utf8");
    expect(await verifyChecksumFile(filePath, blankChecksumFilePath)).toBe(false);
  });
});
