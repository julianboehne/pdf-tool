import { StandardFonts } from '@cantoo/pdf-lib';
import { toPdfToolError } from './errors';
import { loadPdf, savePdf } from './load';
import { hexToRgb } from './color';
import { assertDrawable } from './text';

export type NumberPosition =
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'top-left'
  | 'top-center'
  | 'top-right';

export type NumberFormat = 'plain' | 'ofTotal' | 'pageOfTotal';

export interface PageNumberOptions {
  position: NumberPosition;
  format: NumberFormat;
  fontSize: number;
  /** Distance from the page edge in points. */
  margin: number;
  color: string;
  /** Number printed on the first numbered page. */
  startAt: number;
  /** Leave the first page blank (typical for cover pages). */
  skipFirstPage: boolean;
  /**
   * Localised words for the `pageOfTotal` format, e.g. `{page: 'Seite', of:
   * 'von'}`. Supplied by the UI so the stamped text matches the site language.
   */
  words?: { page: string; of: string };
}

export async function addPageNumbers(
  bytes: Uint8Array,
  options: PageNumberOptions,
): Promise<Uint8Array> {
  if (options.words) {
    assertDrawable(`${options.words.page}${options.words.of}`);
  }

  try {
    const doc = await loadPdf(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const color = hexToRgb(options.color);
    const pages = doc.getPages();

    const firstIndex = options.skipFirstPage ? 1 : 0;
    const total = pages.length - firstIndex;

    pages.forEach((page, index) => {
      if (index < firstIndex) return;

      const number = options.startAt + (index - firstIndex);
      const label = formatLabel(
        options.format,
        number,
        total + options.startAt - 1,
        options.words,
      );

      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(label, options.fontSize);
      const textHeight = font.heightAtSize(options.fontSize);

      const isTop = options.position.startsWith('top');
      const horizontal = options.position.split('-')[1];

      const x =
        horizontal === 'left'
          ? options.margin
          : horizontal === 'right'
            ? width - options.margin - textWidth
            : (width - textWidth) / 2;

      const y = isTop
        ? height - options.margin - textHeight
        : options.margin;

      page.drawText(label, { x, y, size: options.fontSize, font, color });
    });

    return await savePdf(doc);
  } catch (error) {
    throw toPdfToolError(error);
  }
}

function formatLabel(
  format: NumberFormat,
  current: number,
  last: number,
  words: PageNumberOptions['words'],
): string {
  switch (format) {
    case 'ofTotal':
      return `${current} / ${last}`;
    case 'pageOfTotal': {
      const { page, of } = words ?? { page: 'Page', of: 'of' };
      return `${page} ${current} ${of} ${last}`;
    }
    case 'plain':
    default:
      return String(current);
  }
}
