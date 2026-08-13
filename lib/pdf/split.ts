import { PDFDocument } from '@cantoo/pdf-lib';
import { PdfToolError, toPdfToolError } from './errors';
import { loadPdf, savePdf } from './load';
import { formatRangeLabel, parsePageRanges } from './ranges';
import type { PdfResult, ProgressCallback } from './types';

export type SplitMode = 'visual' | 'ranges' | 'everyN' | 'single';

export interface SplitOptions {
  mode: SplitMode;
  /**
   * Used when `mode === 'visual'`: zero-based indices of pages *after* which
   * the document is cut. Always yields contiguous groups covering every page.
   */
  cuts?: number[];
  /** Used when `mode === 'ranges'`, e.g. "1-3, 4, 9-". */
  ranges?: string;
  /** Used when `mode === 'everyN'`. */
  chunkSize?: number;
}

export async function splitPdf(
  bytes: Uint8Array,
  baseName: string,
  options: SplitOptions,
  onProgress?: ProgressCallback,
): Promise<PdfResult[]> {
  try {
    const source = await loadPdf(bytes);
    const pageCount = source.getPageCount();
    if (pageCount === 0) throw new PdfToolError('noPages');

    const groups = buildGroups(pageCount, options);
    const stem = baseName.replace(/\.pdf$/i, '');
    const results: PdfResult[] = [];

    for (const [index, indices] of groups.entries()) {
      const output = await PDFDocument.create();
      const pages = await output.copyPages(source, indices);
      pages.forEach((page) => output.addPage(page));

      results.push({
        name: `${stem}_${formatRangeLabel(indices)}.pdf`,
        bytes: await savePdf(output),
      });
      onProgress?.(index + 1, groups.length);
    }

    return results;
  } catch (error) {
    throw toPdfToolError(error);
  }
}

/**
 * Turns split options into the page groups that become output files.
 *
 * Exported because the tool's preview grid renders exactly these groups — the
 * bands the user sees are the files they will get, not an approximation.
 */
export function buildGroups(
  pageCount: number,
  options: SplitOptions,
): number[][] {
  switch (options.mode) {
    case 'visual': {
      const cuts = [...new Set(options.cuts ?? [])]
        .filter((index) => index >= 0 && index < pageCount - 1)
        .sort((a, b) => a - b);

      const groups: number[][] = [];
      let start = 0;

      for (const cut of [...cuts, pageCount - 1]) {
        groups.push(
          Array.from({ length: cut - start + 1 }, (_, i) => start + i),
        );
        start = cut + 1;
      }

      return groups;
    }

    case 'ranges':
      return parsePageRanges(options.ranges ?? '', pageCount);

    case 'everyN': {
      const size = Math.max(1, Math.floor(options.chunkSize ?? 1));
      const groups: number[][] = [];
      for (let start = 0; start < pageCount; start += size) {
        groups.push(
          Array.from(
            { length: Math.min(size, pageCount - start) },
            (_, i) => start + i,
          ),
        );
      }
      return groups;
    }

    case 'single':
      return Array.from({ length: pageCount }, (_, i) => [i]);
  }
}
