import { PDFDocument } from '@cantoo/pdf-lib';
import { toPdfToolError } from './errors';
import { loadPdf, savePdf } from './load';
import { rasterizePages } from './render';
import type { ProgressCallback } from './types';

/**
 * Two honest modes rather than one magic slider:
 *
 * - `lossless` rewrites the file with cross-reference and object streams.
 *   Text stays text; savings are modest and depend on how the source was
 *   written.
 * - `rasterize` re-renders every page to a JPEG. Savings on scans and
 *   image-heavy documents are large, but the result contains no selectable
 *   text any more. The UI states this explicitly.
 *
 * The spec named pdfium/WASM for this step. That is deferred: pdf.js is
 * already in the bundle for page previews and covers the raster path without a
 * second WASM payload. See README "Abweichungen von der Spezifikation".
 */
export type CompressMode = 'lossless' | 'rasterize';

export interface CompressOptions {
  mode: CompressMode;
  /** Rasterise only: target resolution in dpi. */
  dpi: number;
  /** Rasterise only: JPEG quality 0…1. */
  quality: number;
  /** Rasterise only: discard colour for a further size drop. */
  grayscale: boolean;
}

export interface CompressResult {
  bytes: Uint8Array;
  originalSize: number;
  compressedSize: number;
}

export async function compressPdf(
  bytes: Uint8Array,
  options: CompressOptions,
  onProgress?: ProgressCallback,
): Promise<CompressResult> {
  try {
    const output =
      options.mode === 'lossless'
        ? await compressLossless(bytes, onProgress)
        : await compressRasterized(bytes, options, onProgress);

    return {
      bytes: output,
      originalSize: bytes.byteLength,
      compressedSize: output.byteLength,
    };
  } catch (error) {
    throw toPdfToolError(error);
  }
}

async function compressLossless(
  bytes: Uint8Array,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  onProgress?.(1, 2);
  const output = await savePdf(doc, { useObjectStreams: true });
  onProgress?.(2, 2);
  return output;
}

async function compressRasterized(
  bytes: Uint8Array,
  options: CompressOptions,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  const rendered = await rasterizePages(
    bytes,
    {
      dpi: options.dpi,
      quality: options.quality,
      grayscale: options.grayscale,
    },
    // Rendering is the slow half; reserve the first 90% of the bar for it.
    (done, total) => onProgress?.(done, total + 1),
  );

  const doc = await PDFDocument.create();

  for (const page of rendered) {
    const image = await doc.embedJpg(page.jpeg);
    const pdfPage = doc.addPage([page.widthPt, page.heightPt]);
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: page.widthPt,
      height: page.heightPt,
    });
  }

  const output = await savePdf(doc, { useObjectStreams: true });
  onProgress?.(rendered.length + 1, rendered.length + 1);
  return output;
}
