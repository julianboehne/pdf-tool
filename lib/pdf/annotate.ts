import { PDFDocument, StandardFonts, type PDFFont } from '@cantoo/pdf-lib';
import { PdfToolError, toPdfToolError } from './errors';
import { loadPdf, savePdf } from './load';
import { hexToRgb } from './color';
import { assertDrawable } from './text';

/**
 * Everything the editor and the signature tool place on a page.
 *
 * Geometry is stored in **PDF points with a bottom-left origin** — the same
 * system pdf-lib draws in. The UI converts to screen pixels once, at render
 * time; keeping the model in PDF space means no rounding drift accumulates
 * while dragging.
 */
export interface AnnotationBox {
  id: string;
  /** Zero-based page index. */
  page: number;
  /** Left edge, in points from the left of the page. */
  x: number;
  /** Bottom edge, in points from the bottom of the page. */
  y: number;
  width: number;
  height: number;
}

export interface TextAnnotation extends AnnotationBox {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
}

export interface ShapeAnnotation extends AnnotationBox {
  type: 'rect' | 'ellipse';
  /** `null` means no fill. */
  fill: string | null;
  /** `null` means no outline. */
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
}

export interface ImageAnnotation extends AnnotationBox {
  type: 'image';
  /** `data:image/png;base64,…` or the JPEG equivalent. */
  dataUrl: string;
}

export type Annotation = TextAnnotation | ShapeAnnotation | ImageAnnotation;

/**
 * Draws annotations onto the document, in array order — later entries paint
 * over earlier ones, matching the stacking the user sees on screen.
 */
export async function applyAnnotations(
  bytes: Uint8Array,
  annotations: Annotation[],
): Promise<Uint8Array> {
  if (annotations.length === 0) throw new PdfToolError('emptySelection');

  for (const annotation of annotations) {
    if (annotation.type === 'text') assertDrawable(annotation.text);
  }

  try {
    const doc = await loadPdf(bytes);
    const pages = doc.getPages();

    // Fonts and images are embedded once and reused; embedding per annotation
    // would duplicate the same bytes throughout the file.
    const fonts = new Map<'regular' | 'bold', PDFFont>();
    const images = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();

    const fontFor = async (bold: boolean) => {
      const key = bold ? 'bold' : 'regular';
      let font = fonts.get(key);

      if (!font) {
        font = await doc.embedFont(
          bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica,
        );
        fonts.set(key, font);
      }

      return font;
    };

    for (const annotation of annotations) {
      const page = pages[annotation.page];
      if (!page) continue;

      switch (annotation.type) {
        case 'text': {
          if (!annotation.text.trim()) break;

          const font = await fontFor(annotation.bold);

          page.drawText(annotation.text, {
            x: annotation.x,
            // pdf-lib anchors the first line's baseline at `y` and lays further
            // lines out downwards, so the box top has to be converted first.
            y: annotation.y + annotation.height - annotation.fontSize,
            size: annotation.fontSize,
            font,
            color: hexToRgb(annotation.color),
            maxWidth: annotation.width,
            lineHeight: annotation.fontSize * 1.2,
          });
          break;
        }

        case 'rect': {
          page.drawRectangle({
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
            color: annotation.fill ? hexToRgb(annotation.fill) : undefined,
            opacity: annotation.fill ? annotation.opacity : undefined,
            borderColor: annotation.stroke
              ? hexToRgb(annotation.stroke)
              : undefined,
            borderWidth: annotation.stroke ? annotation.strokeWidth : undefined,
            borderOpacity: annotation.stroke ? annotation.opacity : undefined,
          });
          break;
        }

        case 'ellipse': {
          page.drawEllipse({
            x: annotation.x + annotation.width / 2,
            y: annotation.y + annotation.height / 2,
            xScale: annotation.width / 2,
            yScale: annotation.height / 2,
            color: annotation.fill ? hexToRgb(annotation.fill) : undefined,
            opacity: annotation.fill ? annotation.opacity : undefined,
            borderColor: annotation.stroke
              ? hexToRgb(annotation.stroke)
              : undefined,
            borderWidth: annotation.stroke ? annotation.strokeWidth : undefined,
            borderOpacity: annotation.stroke ? annotation.opacity : undefined,
          });
          break;
        }

        case 'image': {
          let embedded = images.get(annotation.dataUrl);

          if (!embedded) {
            const { bytes: imageBytes, isPng } = decodeDataUrl(annotation.dataUrl);
            embedded = isPng
              ? await doc.embedPng(imageBytes)
              : await doc.embedJpg(imageBytes);
            images.set(annotation.dataUrl, embedded);
          }

          page.drawImage(embedded, {
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
          });
          break;
        }
      }
    }

    return await savePdf(doc);
  } catch (error) {
    throw toPdfToolError(error);
  }
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; isPng: boolean } {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new PdfToolError('unsupportedImage');

  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { bytes, isPng: match[1].toLowerCase() === 'png' };
}
