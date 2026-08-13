import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { PdfToolError, toPdfToolError } from './errors';
import { loadPdf, savePdf } from './load';

/**
 * One page of the *output* document, pointing back at a page of the input.
 * Deleting is expressed by omitting the entry, reordering by the array order,
 * rotating by `rotation`, extracting by keeping only a subset.
 */
export interface PageOp {
  sourceIndex: number;
  /** Additional clockwise rotation in degrees, relative to the source page. */
  rotation: number;
}

/** Builds a new document from an explicit page plan. */
export async function applyPageOps(
  bytes: Uint8Array,
  ops: PageOp[],
): Promise<Uint8Array> {
  if (ops.length === 0) throw new PdfToolError('emptySelection');

  try {
    const source = await loadPdf(bytes);
    const output = await PDFDocument.create();

    const copied = await output.copyPages(
      source,
      ops.map((op) => op.sourceIndex),
    );

    copied.forEach((page, i) => {
      const extra = normaliseAngle(ops[i].rotation);
      if (extra !== 0) {
        page.setRotation(degrees(normaliseAngle(page.getRotation().angle + extra)));
      }
      output.addPage(page);
    });

    return await savePdf(output);
  } catch (error) {
    throw toPdfToolError(error);
  }
}

/** Convenience wrapper for "keep these pages, unchanged" (extract). */
export async function extractPages(
  bytes: Uint8Array,
  indices: number[],
): Promise<Uint8Array> {
  return applyPageOps(
    bytes,
    indices.map((sourceIndex) => ({ sourceIndex, rotation: 0 })),
  );
}

/** PDF only stores rotations in 90° steps within [0, 360). */
export function normaliseAngle(angle: number): number {
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
}
