import { StandardFonts, degrees } from '@cantoo/pdf-lib';
import { PdfToolError, toPdfToolError } from './errors';
import { loadPdf, savePdf } from './load';
import { hexToRgb } from './color';
import { assertDrawable } from './text';

export type WatermarkLayout = 'diagonal' | 'horizontal' | 'tile';

export interface WatermarkOptions {
  text: string;
  layout: WatermarkLayout;
  fontSize: number;
  /** 0…1 */
  opacity: number;
  color: string;
  /** Restrict to these zero-based page indices; all pages when omitted. */
  pageIndices?: number[];
}

const DIAGONAL_ANGLE = 45;

export async function addWatermark(
  bytes: Uint8Array,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  const text = options.text.trim();
  if (!text) throw new PdfToolError('emptySelection');

  // Helvetica's WinAnsi encoding covers Latin-1 including German umlauts.
  // Anything outside it (CJK, emoji) would be dropped without warning.
  assertDrawable(text);

  try {
    const doc = await loadPdf(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const color = hexToRgb(options.color);
    const pages = doc.getPages();

    const targets = options.pageIndices ?? pages.map((_, i) => i);
    if (targets.length === 0) throw new PdfToolError('emptySelection');

    const textWidth = font.widthOfTextAtSize(text, options.fontSize);
    const textHeight = font.heightAtSize(options.fontSize);

    for (const pageIndex of targets) {
      const page = pages[pageIndex];
      if (!page) continue;

      const { width, height } = page.getSize();
      const shared = {
        size: options.fontSize,
        font,
        color,
        opacity: options.opacity,
      };

      if (options.layout === 'tile') {
        const stepX = textWidth * 1.5;
        const stepY = textHeight * 6;

        for (let y = -height; y < height * 2; y += stepY) {
          for (let x = -width; x < width * 2; x += stepX) {
            page.drawText(text, {
              ...shared,
              x,
              y,
              rotate: degrees(DIAGONAL_ANGLE),
            });
          }
        }
        continue;
      }

      const angle = options.layout === 'diagonal' ? DIAGONAL_ANGLE : 0;
      const { x, y } = centeredOrigin(width, height, textWidth, textHeight, angle);

      page.drawText(text, { ...shared, x, y, rotate: degrees(angle) });
    }

    return await savePdf(doc);
  } catch (error) {
    throw toPdfToolError(error);
  }
}

/**
 * pdf-lib rotates text around its draw origin, not its centre. To land the
 * rotated text box in the middle of the page we invert that rotation for the
 * half-extents of the box.
 */
function centeredOrigin(
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  textHeight: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = textWidth / 2;
  const halfH = textHeight / 2;

  return {
    x: pageWidth / 2 - halfW * cos + halfH * sin,
    y: pageHeight / 2 - halfW * sin - halfH * cos,
  };
}
