import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { PdfToolError, toPdfToolError } from './errors';
import { loadPdf, savePdf } from './load';
import { normaliseAngle } from './organize';
import type { PdfSource, ProgressCallback } from './types';

/**
 * One page of the output, pointing at a page of one of the input documents.
 * This is what lets merge reorder pages *across* files rather than only
 * concatenating whole documents.
 */
export interface ComposedPage {
  /** `PdfSource.id` of the document this page comes from. */
  sourceId: string;
  /** Zero-based page index within that document. */
  sourceIndex: number;
  /** Extra clockwise rotation in degrees, relative to the source page. */
  rotation: number;
}

/**
 * Builds one document from an explicit page plan spanning several sources.
 *
 * Pages are copied per source in a single `copyPages` call — copying one page
 * at a time would re-resolve the same shared resources for every page.
 */
export async function composePdf(
  sources: PdfSource[],
  plan: ComposedPage[],
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
  if (plan.length === 0) throw new PdfToolError('emptySelection');

  try {
    const output = await PDFDocument.create();

    // Indices needed per source, in plan order and including duplicates.
    const needed = new Map<string, number[]>();
    for (const page of plan) {
      const list = needed.get(page.sourceId) ?? [];
      list.push(page.sourceIndex);
      needed.set(page.sourceId, list);
    }

    const copied = new Map<string, Awaited<ReturnType<typeof output.copyPages>>>();
    let done = 0;

    for (const [sourceId, indices] of needed) {
      const source = sources.find((candidate) => candidate.id === sourceId);
      if (!source) throw new PdfToolError('emptySelection');

      const doc = await loadPdf(source.bytes);
      copied.set(sourceId, await output.copyPages(doc, indices));

      done += 1;
      onProgress?.(done, needed.size + 1);
    }

    // Walk the plan again, consuming each source's copies in the same order
    // they were requested.
    const cursor = new Map<string, number>();

    for (const entry of plan) {
      const index = cursor.get(entry.sourceId) ?? 0;
      cursor.set(entry.sourceId, index + 1);

      const page = copied.get(entry.sourceId)![index];
      const extra = normaliseAngle(entry.rotation);

      if (extra !== 0) {
        page.setRotation(
          degrees(normaliseAngle(page.getRotation().angle + extra)),
        );
      }

      output.addPage(page);
    }

    const bytes = await savePdf(output);
    onProgress?.(needed.size + 1, needed.size + 1);

    return bytes;
  } catch (error) {
    throw toPdfToolError(error);
  }
}
