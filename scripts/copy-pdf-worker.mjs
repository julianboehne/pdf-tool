// Copies the pdf.js worker out of node_modules into ./public so it can be
// served from a stable, versionless URL (`/pdf.worker.min.mjs`).
//
// Referencing the worker through `new URL(..., import.meta.url)` is fragile
// across the webpack/turbopack split; a plain public asset is deterministic.
// Runs from `predev` and `prebuild`.

import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const WORKER_FILE = 'pdf.worker.min.mjs';
const TARGET_DIR = join(process.cwd(), 'public');

try {
  const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));

  mkdirSync(TARGET_DIR, { recursive: true });

  copyFileSync(
    join(pdfjsRoot, 'build', WORKER_FILE),
    join(TARGET_DIR, WORKER_FILE),
  );
  console.log(`[copy-pdf-worker] build/${WORKER_FILE} -> public/${WORKER_FILE}`);

  // Metrics for the 14 standard PDF fonts. Text extraction needs them to
  // resolve documents that reference those fonts without embedding them;
  // without this pdf.js warns and falls back to guessed metrics.
  cpSync(join(pdfjsRoot, 'standard_fonts'), join(TARGET_DIR, 'standard_fonts'), {
    recursive: true,
  });
  console.log('[copy-pdf-worker] standard_fonts/ -> public/standard_fonts/');
} catch (error) {
  console.error('[copy-pdf-worker] failed:', error.message);
  process.exit(1);
}
