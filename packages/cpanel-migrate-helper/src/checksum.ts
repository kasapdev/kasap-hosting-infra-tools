import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * Streams `filePath` through an MD5 hash (never loading the whole file into
 * memory) and returns the hex digest.
 */
export async function computeMd5(filePath: string): Promise<string> {
  const hash = createHash("md5");
  // `hash` is a Transform stream: piping the file's readable stream into it
  // drives real chunk-by-chunk hashing, and pipeline() drains hash's
  // readable side for us so it runs to completion.
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

/**
 * Computes the MD5 of `filePath` and writes it next to the file as
 * `<filePath>.md5`, in the standard `md5sum`-compatible format:
 * `<hex>  <basename>\n`. Returns the path of the checksum file written.
 */
export async function writeChecksumFile(filePath: string): Promise<string> {
  const digest = await computeMd5(filePath);
  const checksumFilePath = `${filePath}.md5`;
  const line = `${digest}  ${basename(filePath)}\n`;
  await writeFile(checksumFilePath, line, "utf8");
  return checksumFilePath;
}

/**
 * Recomputes the MD5 of `filePath` and compares it against the digest stored
 * in `checksumFilePath` (an `md5sum`-format file, as written by
 * `writeChecksumFile`). Returns true only if they match.
 */
export async function verifyChecksumFile(filePath: string, checksumFilePath: string): Promise<boolean> {
  const actualDigest = await computeMd5(filePath);
  const checksumFileContent = await readFile(checksumFilePath, "utf8");
  const firstLine = checksumFileContent.split(/\r?\n/)[0] ?? "";
  const expectedDigest = firstLine.trim().split(/\s+/)[0] ?? "";
  if (expectedDigest.length === 0) {
    return false;
  }
  return expectedDigest.toLowerCase() === actualDigest.toLowerCase();
}
