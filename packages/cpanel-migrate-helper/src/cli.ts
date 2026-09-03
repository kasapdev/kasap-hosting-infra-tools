#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { Command } from "commander";
import { verifyChecksumFile, writeChecksumFile } from "./checksum.js";
import { packDirectory } from "./pack.js";
import {
  buildRunbook,
  formatRunbookJson,
  formatRunbookText,
  parseAccountsCsv,
  parseAccountsJson,
} from "./plan.js";

/** Wraps a commander .action() handler so a thrown/rejected error prints a
 * clean message and sets a non-zero exit code, instead of an unhandled
 * rejection stack trace. */
function withErrorHandling<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await fn(...args);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  };
}

const program = new Command();

program
  .name("cpanel-migrate-helper")
  .description(
    "cPanel-to-cPanel migration helper: packs account home directories into checksummed archives, " +
      "and generates (but never executes) manual migration runbooks.",
  )
  .version("0.1.0");

program
  .command("pack")
  .description("Pack a directory (e.g. a cPanel account's home directory) into a gzip-compressed tar archive")
  .argument("<sourceDir>", "directory to archive")
  .argument("<outputArchive>", "path to write the .tar.gz archive to")
  .option("--verify", "immediately re-verify the archive against its checksum after packing", false)
  .action(
    withErrorHandling(async (sourceDir: string, outputArchive: string, opts: { verify: boolean }) => {
      console.log(`Packing "${sourceDir}" -> "${outputArchive}" ...`);

      let entryCount = 0;
      await packDirectory(sourceDir, outputArchive, {
        onProgress: (info) => {
          entryCount++;
          console.log(`  [${entryCount}] ${info.path}`);
        },
      });
      console.log(`Packed ${entryCount} ${entryCount === 1 ? "entry" : "entries"} into "${outputArchive}".`);

      const checksumFilePath = await writeChecksumFile(outputArchive);
      const checksumLine = (await readFile(checksumFilePath, "utf8")).trim();
      console.log(`Checksum written: ${checksumFilePath}`);
      console.log(`  ${checksumLine}`);

      if (opts.verify) {
        const isValid = await verifyChecksumFile(outputArchive, checksumFilePath);
        console.log(isValid ? "Verification: OK" : "Verification: FAILED");
        if (!isValid) {
          process.exitCode = 1;
        }
      }
    }),
  );

program
  .command("plan")
  .description("Generate a manual migration runbook from an accounts .csv or .json file")
  .argument("<accountsFile>", "path to a .csv or .json accounts file")
  .option("--json", "output the runbook as JSON instead of plain text", false)
  .option("-o, --output <file>", "write the runbook to a file instead of stdout")
  .action(
    withErrorHandling(async (accountsFile: string, opts: { json: boolean; output?: string }) => {
      const raw = await readFile(accountsFile, "utf8");
      const ext = extname(accountsFile).toLowerCase();

      const accounts =
        ext === ".csv"
          ? parseAccountsCsv(raw)
          : ext === ".json"
            ? parseAccountsJson(raw)
            : (() => {
                throw new Error(`Unsupported accounts file extension "${ext}". Expected .csv or .json.`);
              })();

      const steps = buildRunbook(accounts);
      const rendered = opts.json ? formatRunbookJson(steps) : formatRunbookText(steps);

      if (opts.output) {
        await writeFile(opts.output, rendered, "utf8");
        console.log(`Runbook written to "${opts.output}" (${steps.length} step(s)).`);
      } else {
        console.log(rendered);
      }
    }),
  );

await program.parseAsync(process.argv);
