'use client';

import type { Rect } from '@/lib/pdf/guides';

export interface BackgroundSample {
  /** Best-guess page colour behind the region, as `#rrggbb`. */
  hex: string;
  /**
   * Whether the surroundings were near enough to one flat colour for a cover
   * rectangle to be invisible. When false, covering will leave a visible patch.
   */
  uniform: boolean;
}

/** Maximum channel spread still counted as "one flat colour". */
const UNIFORM_TOLERANCE = 12;

let cachedUrl: string | null = null;
let cachedContext: CanvasRenderingContext2D | null = null;
let cachedSize: { width: number; height: number } | null = null;

/**
 * Reads the page colour immediately around a region from the already-rendered
 * page raster.
 *
 * Replacing text means covering the original first, and a cover rectangle only
 * disappears if it matches what is behind it. Sampling the ring *around* the
 * text — never the text itself — gives that colour, and the spread across those
 * samples says whether covering is going to work at all.
 */
export async function sampleBackground(
  pageDataUrl: string,
  pageSizePt: { width: number; height: number },
  region: Rect,
): Promise<BackgroundSample> {
  const context = await getContext(pageDataUrl);
  if (!context || !cachedSize) return { hex: '#ffffff', uniform: false };

  const scaleX = cachedSize.width / pageSizePt.width;
  const scaleY = cachedSize.height / pageSizePt.height;

  // Convert to raster space; the raster's y axis points down.
  const left = region.x * scaleX;
  const right = (region.x + region.width) * scaleX;
  const top = (pageSizePt.height - region.y - region.height) * scaleY;
  const bottom = (pageSizePt.height - region.y) * scaleY;

  const margin = Math.max(2, (bottom - top) * 0.35);
  const samples: Array<[number, number, number]> = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= cachedSize!.width || y >= cachedSize!.height) return;
    const data = context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    samples.push([data[0], data[1], data[2]]);
  };

  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const x = left + ((right - left) * i) / steps;
    push(x, top - margin);
    push(x, bottom + margin);
  }
  for (let i = 0; i <= 4; i++) {
    const y = top + ((bottom - top) * i) / 4;
    push(left - margin, y);
    push(right + margin, y);
  }

  if (samples.length === 0) return { hex: '#ffffff', uniform: false };

  const median = (channel: number) => {
    const values = samples.map((sample) => sample[channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };

  const centre: [number, number, number] = [median(0), median(1), median(2)];

  const spread = Math.max(
    ...samples.map((sample) =>
      Math.max(
        Math.abs(sample[0] - centre[0]),
        Math.abs(sample[1] - centre[1]),
        Math.abs(sample[2] - centre[2]),
      ),
    ),
  );

  return {
    hex: `#${centre.map((value) => value.toString(16).padStart(2, '0')).join('')}`,
    uniform: spread <= UNIFORM_TOLERANCE,
  };
}

/** One decoded raster per page, reused across every sample on that page. */
async function getContext(
  dataUrl: string,
): Promise<CanvasRenderingContext2D | null> {
  if (cachedUrl === dataUrl && cachedContext) return cachedContext;

  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0);

  cachedUrl = dataUrl;
  cachedContext = context;
  cachedSize = { width: canvas.width, height: canvas.height };

  return context;
}
