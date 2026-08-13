import { rgb, type RGB } from '@cantoo/pdf-lib';

/** Converts `#rrggbb` (or `#rgb`) to a pdf-lib colour. Falls back to grey. */
export function hexToRgb(hex: string): RGB {
  const normalised = hex.trim().replace(/^#/, '');

  const full =
    normalised.length === 3
      ? normalised
          .split('')
          .map((c) => c + c)
          .join('')
      : normalised;

  if (!/^[0-9a-f]{6}$/i.test(full)) return rgb(0.5, 0.5, 0.5);

  return rgb(
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  );
}
