import { PDFDocument } from '@cantoo/pdf-lib';
import { PdfToolError, toPdfToolError } from './errors';
import { loadPdf, savePdf } from './load';
import type { PdfSource, ProgressCallback } from './types';

/**
 * Concatenates documents in the given order. Page order within each source is
 * preserved; page size and rotation are carried over by `copyPages`.
 */
export async function mergePdfs(
  sources: PdfSource[],
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  if (sources.length === 0) throw new PdfToolError('emptySelection');

  try {
    const merged = await PDFDocument.create();

    for (const [index, source] of sources.entries()) {
      const doc = await loadPdf(source.bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
      onProgress?.(index + 1, sources.length);
    }

    if (merged.getPageCount() === 0) throw new PdfToolError('noPages');

    return await savePdf(merged);
  } catch (error) {
    throw toPdfToolError(error);
  }
}
