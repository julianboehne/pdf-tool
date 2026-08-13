import { PdfToolError } from './errors';
import type { FontFamily } from './fonts';

/**
 * A run of text found in the document's existing text layer, grouped into a
 * visual line.
 *
 * Coordinates come straight from pdf.js's `transform`, which is already in PDF
 * user space with a bottom-left origin — the same system annotations use, so
 * nothing needs converting.
 */
export interface TextLine {
  id: string;
  text: string;
  /** Left edge of the line. */
  x: number;
  /** Baseline of the line. */
  baseline: number;
  width: number;
  fontSize: number;
  /** Best-guess standard family, from pdf.js's generic font classification. */
  family: FontFamily;
  bold: boolean;
}

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return mod;
    });
  }
  return pdfjsPromise;
}

/** Items whose baselines differ by less than this are treated as one line. */
const LINE_TOLERANCE_PT = 2.5;
/** Horizontal gap above which a new line is started rather than a space. */
const GAP_FACTOR = 1.2;

/**
 * Extracts the text of one page, grouped into lines.
 *
 * Only works on documents that carry a text layer. Scans hold pixels, not
 * characters, and return nothing here — the caller reports that rather than
 * silently showing an empty result.
 */
export async function extractTextLines(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<TextLine[]> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    // Lets pdf.js resolve the 14 standard fonts without network guesses.
    standardFontDataUrl: '/standard_fonts/',
  }).promise;

  try {
    if (pageIndex < 0 || pageIndex >= doc.numPages) {
      throw new PdfToolError('noPages');
    }

    const page = await doc.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    const styles = content.styles as Record<
      string,
      { fontFamily?: string } | undefined
    >;

    interface Pending {
      parts: string[];
      x: number;
      right: number;
      baseline: number;
      fontSize: number;
      fontName: string;
    }

    const lines: Pending[] = [];

    for (const raw of content.items) {
      if (!('str' in raw)) continue;

      const item = raw as {
        str: string;
        transform: number[];
        width: number;
        height: number;
        fontName: string;
        hasEOL: boolean;
      };

      if (!item.str.trim()) continue;

      const x = item.transform[4];
      const baseline = item.transform[5];
      const fontSize = Math.abs(item.transform[3]) || item.height;

      // Continue the current line when the item sits on the same baseline and
      // follows closely enough to be part of the same run.
      const open = lines[lines.length - 1];
      const continues =
        open !== undefined &&
        Math.abs(open.baseline - baseline) <= LINE_TOLERANCE_PT &&
        x - open.right <= fontSize * GAP_FACTOR &&
        x >= open.x;

      if (continues) {
        // pdf.js drops the space between separately positioned runs.
        const needsSpace = x - open.right > fontSize * 0.12;
        open.parts.push(needsSpace ? ` ${item.str}` : item.str);
        open.right = x + item.width;
      } else {
        lines.push({
          parts: [item.str],
          x,
          right: x + item.width,
          baseline,
          fontSize,
          fontName: item.fontName,
        });
      }
    }

    return lines
      .map((line, index) => {
        const generic = styles[line.fontName]?.fontFamily ?? 'sans-serif';

        return {
          id: `line-${pageIndex}-${index}`,
          text: line.parts.join('').trim(),
          x: line.x,
          baseline: line.baseline,
          width: line.right - line.x,
          fontSize: line.fontSize,
          family: familyFromGeneric(generic),
          // pdf.js does not report weight, so this stays an honest guess based
          // on the embedded font's own name.
          bold: /bold|black|heavy|semibold/i.test(line.fontName),
        };
      })
      .filter((line) => line.text.length > 0);
  } finally {
    await doc.destroy();
  }
}

function familyFromGeneric(generic: string): FontFamily {
  if (/mono/i.test(generic)) return 'courier';
  if (/serif/i.test(generic) && !/sans/i.test(generic)) return 'times';
  return 'helvetica';
}
