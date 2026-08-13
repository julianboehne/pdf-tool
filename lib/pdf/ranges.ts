import { PdfToolError } from './errors';

/**
 * Parses a human page-range expression into groups of zero-based page indices.
 *
 * Accepted syntax (1-based, inclusive), comma separated:
 *   "1-3"   → one group [0,1,2]
 *   "5"     → one group [4]
 *   "8-"    → page 8 to the end
 *   "-4"    → start to page 4
 *
 * Each comma-separated part becomes its own group, which is what the split tool
 * turns into one output file per group.
 */
export function parsePageRanges(input: string, pageCount: number): number[][] {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) throw new PdfToolError('invalidRange');

  return parts.map((part) => {
    const match = /^(\d*)\s*(?:-\s*(\d*))?$/.exec(part);
    if (!match) throw new PdfToolError('invalidRange');

    const hasDash = part.includes('-');
    const rawFrom = match[1];
    const rawTo = match[2];

    if (!hasDash) {
      if (!rawFrom) throw new PdfToolError('invalidRange');
      const page = Number(rawFrom);
      assertInBounds(page, pageCount);
      return [page - 1];
    }

    const from = rawFrom ? Number(rawFrom) : 1;
    const to = rawTo ? Number(rawTo) : pageCount;

    assertInBounds(from, pageCount);
    assertInBounds(to, pageCount);
    if (from > to) throw new PdfToolError('invalidRange');

    return Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
  });
}

/** Flattened, de-duplicated variant for tools that extract a single subset. */
export function parsePageSelection(input: string, pageCount: number): number[] {
  const flat = parsePageRanges(input, pageCount).flat();
  return [...new Set(flat)].sort((a, b) => a - b);
}

function assertInBounds(page: number, pageCount: number): void {
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new PdfToolError('invalidRange');
  }
}

/** Renders a group of indices back as a human label, e.g. "3-7" or "2". */
export function formatRangeLabel(indices: number[]): string {
  if (indices.length === 0) return '';
  const first = indices[0] + 1;
  const last = indices[indices.length - 1] + 1;
  return first === last ? `${first}` : `${first}-${last}`;
}
