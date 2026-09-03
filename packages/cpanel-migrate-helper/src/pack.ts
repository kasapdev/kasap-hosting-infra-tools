import type { Stats } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import * as tar from "tar";

/** Progress info reported while an archive is being built. */
export interface PackProgressInfo {
  /** Path of the entry (file or directory) currently being added, relative to the archive root. */
  path: string;
  /** Running total of file bytes seen so far (directories don't add to this). */
  processedBytes?: number;
}

export interface PackOptions {
  /** Called once per entry (file/dir) as the archive is walked and written. */
  onProgress?: (info: PackProgressInfo) => void;
}

/**
 * Recursively packs `sourceDir` into a gzip-compressed tar archive at
 * `outputArchivePath`.
 *
 * This is a thin wrapper around the real `tar` package's `create()` — it does
 * not reimplement any archive format logic. The source directory itself is
 * included as the top-level entry in the archive (i.e. packing
 * `/home/someuser` produces an archive whose entries all start with
 * `someuser/...`), which mirrors how cPanel account backups are laid out.
 */
export async function packDirectory(
  sourceDir: string,
  outputArchivePath: string,
  opts: PackOptions = {},
): Promise<void> {
  const resolvedSource = resolve(sourceDir);
  const cwd = dirname(resolvedSource);
  const entryName = basename(resolvedSource);

  let processedBytes = 0;

  await tar.create(
    {
      gzip: true,
      file: outputArchivePath,
      cwd,
      // `filter` is called by tar's own walker for every entry it is about
      // to add to the archive, before the entry is written. Using it (rather
      // than polling the filesystem ourselves) gives real, per-file progress
      // driven directly by tar's internal traversal.
      //
      // tar's `filter` type covers both create (called with a real fs.Stats)
      // and extract (called with a ReadEntry) usage, so the parameter is
      // left contextually typed here and narrowed to Stats below rather than
      // annotated directly (a narrower explicit annotation would not be
      // assignable to the wider callback type tar expects).
      filter: (entryPath, statOrEntry): boolean => {
        if (opts.onProgress) {
          const stat = statOrEntry as Stats;
          if (typeof stat.isFile === "function" && stat.isFile()) {
            processedBytes += stat.size;
          }
          opts.onProgress({ path: entryPath, processedBytes });
        }
        return true;
      },
    },
    [entryName],
  );
}
