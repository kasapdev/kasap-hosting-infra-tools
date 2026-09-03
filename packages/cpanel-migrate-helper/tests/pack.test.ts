import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import { afterEach, describe, expect, it } from "vitest";
import { packDirectory } from "../src/pack.js";

describe("packDirectory", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    const dirs = tempDirs.splice(0);
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function makeTempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  it("packs a real directory tree into an extractable tar.gz archive", async () => {
    const sourceRoot = await makeTempDir("cpanel-migrate-src-");
    const accountDir = join(sourceRoot, "testuser");
    const publicHtmlDir = join(accountDir, "public_html");
    await mkdir(publicHtmlDir, { recursive: true });

    await writeFile(join(accountDir, "readme.txt"), "hello from the account home directory\n", "utf8");
    await writeFile(join(publicHtmlDir, "index.html"), "<html><body>hi</body></html>", "utf8");
    await writeFile(join(publicHtmlDir, "config.json"), JSON.stringify({ ok: true }), "utf8");

    const outputDir = await makeTempDir("cpanel-migrate-out-");
    const archivePath = join(outputDir, "testuser_backup.tar.gz");

    const progressEvents: { path: string; processedBytes?: number }[] = [];
    await packDirectory(accountDir, archivePath, {
      onProgress: (info) => progressEvents.push(info),
    });

    // Real, per-file progress reporting fired at least once.
    expect(progressEvents.length).toBeGreaterThan(0);

    const extractDir = await makeTempDir("cpanel-migrate-extract-");
    await tar.extract({ file: archivePath, cwd: extractDir });

    const extractedReadme = await readFile(join(extractDir, "testuser", "readme.txt"), "utf8");
    const extractedIndex = await readFile(join(extractDir, "testuser", "public_html", "index.html"), "utf8");
    const extractedConfig = await readFile(join(extractDir, "testuser", "public_html", "config.json"), "utf8");

    expect(extractedReadme).toBe("hello from the account home directory\n");
    expect(extractedIndex).toBe("<html><body>hi</body></html>");
    expect(extractedConfig).toBe(JSON.stringify({ ok: true }));
  });
});
