// Copies the pdf.js worker out of node_modules into ./public so it can be
// served from a stable, versionless URL (`/pdf.worker.min.mjs`).
//
// Referencing the worker through `new URL(..., import.meta.url)` is fragile
// across the webpack/turbopack split; a plain public asset is deterministic.
// Runs from `predev` and `prebuild`.

import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const WORKER_FILE = 'pdf.worker.min.mjs';
const TARGET_DIR = join(process.cwd(), 'public');

try {
  const pdfjsEntry = require.resolve('pdfjs-dist/package.json');
  const source = join(dirname(pdfjsEntry), 'build', WORKER_FILE);

  mkdirSync(TARGET_DIR, { recursive: true });
  copyFileSync(source, join(TARGET_DIR, WORKER_FILE));

  console.log(`[copy-pdf-worker] ${source} -> public/${WORKER_FILE}`);
} catch (error) {
  console.error('[copy-pdf-worker] failed:', error.message);
  process.exit(1);
}
