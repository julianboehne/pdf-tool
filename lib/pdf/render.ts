import { PdfToolError } from './errors';
import type { ProgressCallback } from './types';

// pdf.js is browser-only and pulls in a sizeable worker, so it is loaded on
// demand — never during SSR and never on tool pages that do not preview pages.
type PdfjsModule = typeof import('pdfjs-dist');

/** pdf.js paints this behind every page, so transparency survives JPEG. */
const WHITE = 'rgb(255,255,255)';

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      // Served from /public by scripts/copy-pdf-worker.mjs.
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return mod;
    });
  }
  return pdfjsPromise;
}

interface OpenOptions {
  password?: string;
}

async function openDocument(bytes: Uint8Array, options: OpenOptions = {}) {
  const pdfjs = await getPdfjs();

  // pdf.js detaches the buffer it is handed, so it always gets a copy.
  return pdfjs.getDocument({
    data: bytes.slice(),
    password: options.password,
  }).promise;
}

export interface PageThumbnail {
  pageIndex: number;
  dataUrl: string;
  /** Intrinsic page size in PDF points, before any rotation. */
  widthPt: number;
  heightPt: number;
}

/** Renders every page to a small PNG data URL for the page-organiser grid. */
export async function renderThumbnails(
  bytes: Uint8Array,
  maxEdge = 240,
  onProgress?: ProgressCallback,
  options: OpenOptions = {},
): Promise<PageThumbnail[]> {
  try {
    const doc = await openDocument(bytes, options);
    const thumbnails: PageThumbnail[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = maxEdge / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale });

        const { canvas } = createCanvas(viewport.width, viewport.height);
        await page.render({ canvas, viewport, background: WHITE }).promise;

        thumbnails.push({
          pageIndex: pageNumber - 1,
          dataUrl: canvas.toDataURL('image/png'),
          widthPt: base.width,
          heightPt: base.height,
        });

        page.cleanup();
        onProgress?.(pageNumber, doc.numPages);
        await yieldToBrowser();
      }
    } finally {
      await doc.destroy();
    }

    return thumbnails;
  } catch (error) {
    throw asRenderError(error);
  }
}

/**
 * Renders one page at preview resolution. Used by the live previews, which
 * re-render on every option change and must not pay for the whole document.
 */
export async function renderSinglePage(
  bytes: Uint8Array,
  pageIndex: number,
  maxEdge = 520,
  options: OpenOptions = {},
): Promise<PageThumbnail> {
  try {
    const doc = await openDocument(bytes, options);

    try {
      if (pageIndex < 0 || pageIndex >= doc.numPages) {
        throw new PdfToolError('noPages');
      }

      const page = await doc.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: maxEdge / Math.max(base.width, base.height),
      });

      const { canvas } = createCanvas(viewport.width, viewport.height);
      await page.render({ canvas, viewport, background: WHITE }).promise;
      page.cleanup();

      return {
        pageIndex,
        dataUrl: canvas.toDataURL('image/png'),
        widthPt: base.width,
        heightPt: base.height,
      };
    } finally {
      await doc.destroy();
    }
  } catch (error) {
    throw asRenderError(error);
  }
}

export interface RasterOptions {
  /** Target resolution; 72 dpi means "no upscaling beyond the page size". */
  dpi: number;
  /** JPEG quality, 0…1. */
  quality: number;
  grayscale: boolean;
  password?: string;
}

export interface RasterPage {
  jpeg: Uint8Array;
  widthPt: number;
  heightPt: number;
}

/** Renders pages to JPEG — the basis of the strong compression mode. */
export async function rasterizePages(
  bytes: Uint8Array,
  options: RasterOptions,
  onProgress?: ProgressCallback,
): Promise<RasterPage[]> {
  try {
    const doc = await openDocument(bytes, { password: options.password });
    const pages: RasterPage[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        // Page rotation is baked into the raster, so the output page uses the
        // rotated dimensions and needs no /Rotate entry of its own.
        const scale = options.dpi / 72;
        const viewport = page.getViewport({ scale });

        const { canvas, ctx } = createCanvas(viewport.width, viewport.height);
        await page.render({ canvas, viewport, background: WHITE }).promise;

        if (options.grayscale) applyGrayscale(ctx, canvas.width, canvas.height);

        pages.push({
          jpeg: await canvasToJpeg(canvas, options.quality),
          widthPt: viewport.width / scale,
          heightPt: viewport.height / scale,
        });

        page.cleanup();
        onProgress?.(pageNumber, doc.numPages);
        await yieldToBrowser();
      }
    } finally {
      await doc.destroy();
    }

    return pages;
  } catch (error) {
    throw asRenderError(error);
  }
}

export async function countPages(
  bytes: Uint8Array,
  options: OpenOptions = {},
): Promise<number> {
  const doc = await openDocument(bytes, options);
  try {
    return doc.numPages;
  } finally {
    await doc.destroy();
  }
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PdfToolError('renderFailed');

  return { canvas, ctx };
}

function applyGrayscale(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;

  for (let i = 0; i < data.length; i += 4) {
    // Rec. 601 luma — matches what most PDF viewers use for grey conversion.
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = luma;
  }

  ctx.putImageData(image, 0, 0);
}

function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new PdfToolError('renderFailed'));
          return;
        }
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      'image/jpeg',
      quality,
    );
  });
}

/** Lets the browser paint progress updates between pages. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function asRenderError(error: unknown): PdfToolError {
  if (error instanceof PdfToolError) return error;

  const name = (error as { name?: string })?.name ?? '';
  if (name === 'PasswordException') return new PdfToolError('encrypted');
  if (name === 'InvalidPDFException') return new PdfToolError('invalidPdf');

  return new PdfToolError('renderFailed');
}
