import { BlendMode, PDFDocument, type PDFFont } from '@cantoo/pdf-lib';
import { PdfToolError, toPdfToolError } from './errors';
import { loadPdf, savePdf } from './load';
import { hexToRgb } from './color';
import { assertDrawableWith } from './text';
import { resolveFont, type FontFamily } from './fonts';

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

export type TextAlign = 'left' | 'center' | 'right';

export interface TextAnnotation extends AnnotationBox {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
  fontFamily: FontFamily;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  /** Box fill painted behind the text; `null` leaves the page showing. */
  background: string | null;
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

/**
 * A straight line, optionally with an arrow head at its end.
 *
 * Stored as the bounding box plus which diagonal it runs along, so the same
 * move-and-resize frame that handles every other element works here too — while
 * still remembering which way the arrow points.
 */
export interface LineAnnotation extends AnnotationBox {
  type: 'line' | 'arrow';
  /** `'bottom-left'` runs ↗ from the box's bottom-left; `'top-left'` runs ↘. */
  fromCorner: 'bottom-left' | 'top-left';
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

/** The two endpoints a line annotation describes, in PDF points. */
export function lineEndpoints(annotation: LineAnnotation): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  return annotation.fromCorner === 'bottom-left'
    ? {
        start: { x: annotation.x, y: annotation.y },
        end: { x: annotation.x + annotation.width, y: annotation.y + annotation.height },
      }
    : {
        start: { x: annotation.x, y: annotation.y + annotation.height },
        end: { x: annotation.x + annotation.width, y: annotation.y },
      };
}

/**
 * A marker stroke. Drawn in Multiply blend mode so the text underneath stays
 * readable — a plain opaque rectangle would bury it, and a low-opacity one
 * would wash the text out along with the background.
 */
export interface HighlightAnnotation extends AnnotationBox {
  type: 'highlight';
  color: string;
}

export interface ImageAnnotation extends AnnotationBox {
  type: 'image';
  /** `data:image/png;base64,…` or the JPEG equivalent. */
  dataUrl: string;
}

export type Annotation =
  | TextAnnotation
  | ShapeAnnotation
  | LineAnnotation
  | HighlightAnnotation
  | ImageAnnotation;

/** Line spacing as a multiple of the font size. */
const LINE_HEIGHT = 1.2;

/**
 * Paint order: highlights first, everything else after, each group keeping the
 * order the user built it in.
 *
 * A marker is ink *under* the page's content, so drawing one after a text box
 * must not put it on top — reaching for the marker last is the normal way to
 * work, not a reason to bury what you just wrote.
 */
export function sortForPainting(annotations: Annotation[]): Annotation[] {
  return [
    ...annotations.filter((item) => item.type === 'highlight'),
    ...annotations.filter((item) => item.type !== 'highlight'),
  ];
}

/**
 * Draws annotations onto the document, in array order — later entries paint
 * over earlier ones, matching the stacking the user sees on screen. Highlights
 * are pulled to the back so a marker never covers text placed on top of it.
 */
export async function applyAnnotations(
  bytes: Uint8Array,
  annotations: Annotation[],
): Promise<Uint8Array> {
  if (annotations.length === 0) throw new PdfToolError('emptySelection');

  for (const annotation of annotations) {
    if (annotation.type === 'text') {
      assertDrawableWith(annotation.text, annotation.fontFamily);
    }
  }

  try {
    const doc = await loadPdf(bytes);
    const pages = doc.getPages();
    const images = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();

    for (const annotation of sortForPainting(annotations)) {
      const page = pages[annotation.page];
      if (!page) continue;

      switch (annotation.type) {
        case 'highlight': {
          page.drawRectangle({
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
            color: hexToRgb(annotation.color),
            blendMode: BlendMode.Multiply,
          });
          break;
        }

        case 'text': {
          if (annotation.background) {
            page.drawRectangle({
              x: annotation.x,
              y: annotation.y,
              width: annotation.width,
              height: annotation.height,
              color: hexToRgb(annotation.background),
            });
          }

          if (!annotation.text.trim()) break;

          const font = await resolveFont(doc, {
            family: annotation.fontFamily,
            bold: annotation.bold,
            italic: annotation.italic,
          });

          drawParagraph(page, annotation, font);
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

        case 'line':
        case 'arrow': {
          const { start, end } = lineEndpoints(annotation);
          const color = hexToRgb(annotation.stroke);

          page.drawLine({
            start,
            end,
            thickness: annotation.strokeWidth,
            color,
            opacity: annotation.opacity,
          });

          if (annotation.type === 'arrow') {
            drawArrowHead(page, start, end, annotation, color);
          }
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

/**
 * Closes an arrow with two short strokes at its tip.
 *
 * Built from lines rather than a filled path so the head always matches the
 * shaft's colour, width and opacity exactly — a filled triangle drifts visibly
 * from a thin shaft.
 */
function drawArrowHead(
  page: ReturnType<PDFDocument['getPages']>[number],
  start: { x: number; y: number },
  end: { x: number; y: number },
  annotation: LineAnnotation,
  color: ReturnType<typeof hexToRgb>,
): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = Math.hypot(end.x - start.x, end.y - start.y);

  // Scale the head with the stroke, but never let it outgrow the shaft.
  const headLength = Math.min(annotation.strokeWidth * 4 + 4, length * 0.4);
  const spread = Math.PI / 7;

  for (const direction of [angle + Math.PI - spread, angle + Math.PI + spread]) {
    page.drawLine({
      start: end,
      end: {
        x: end.x + Math.cos(direction) * headLength,
        y: end.y + Math.sin(direction) * headLength,
      },
      thickness: annotation.strokeWidth,
      color,
      opacity: annotation.opacity,
    });
  }
}

/**
 * Lays the text out line by line.
 *
 * pdf-lib's own `maxWidth` wraps but always left-aligns, so alignment means
 * measuring each line and placing it manually.
 */
function drawParagraph(
  page: ReturnType<PDFDocument['getPages']>[number],
  annotation: TextAnnotation,
  font: PDFFont,
): void {
  const lines = wrapText(annotation.text, annotation.width, annotation.fontSize, font);
  const lineHeight = annotation.fontSize * LINE_HEIGHT;
  const color = hexToRgb(annotation.color);

  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, annotation.fontSize);

    const x =
      annotation.align === 'center'
        ? annotation.x + (annotation.width - lineWidth) / 2
        : annotation.align === 'right'
          ? annotation.x + annotation.width - lineWidth
          : annotation.x;

    page.drawText(line, {
      x,
      // First baseline sits one font size below the box top, then each further
      // line drops by the line height.
      y: annotation.y + annotation.height - annotation.fontSize - index * lineHeight,
      size: annotation.fontSize,
      font,
      color,
    });
  });
}

/**
 * Greedy word wrap against the measured width of the actual font. Explicit
 * newlines are honoured; a single word wider than the box is left to overflow
 * rather than being broken mid-word.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: Pick<PDFFont, 'widthOfTextAtSize'>,
): string[] {
  const output: string[] = [];

  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      output.push('');
      continue;
    }

    let current = words[0];

    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;

      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        output.push(current);
        current = word;
      }
    }

    output.push(current);
  }

  return output;
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
