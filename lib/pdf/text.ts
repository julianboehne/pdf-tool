import { PdfToolError } from './errors';
import { isNotoEncodable, type FontFamily } from './fonts';

/**
 * The 27 code points CP1252 places in 0x80-0x9F, where Latin-1 has controls.
 * WinAnsiEncoding — the encoding the PDF standard fonts use — maps exactly
 * these in addition to ASCII and the Latin-1 supplement.
 */
const CP1252_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export function isWinAnsiEncodable(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0)!;

    const encodable =
      code === 0x0a || // line feed, handled by drawText itself
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      CP1252_EXTRAS.has(code);

    if (!encodable) return false;
  }

  return true;
}

/**
 * Guards text that is about to be drawn with a standard font.
 *
 * `@cantoo/pdf-lib` drops characters WinAnsi cannot represent *silently* — the
 * user would get a blank or mangled stamp with no indication why. Checking up
 * front turns that into an explicit, translatable error.
 *
 * Lifting this restriction means embedding a Unicode font with fontkit, which
 * is Phase-2 work (see README).
 */
export function assertDrawable(text: string): void {
  if (!isWinAnsiEncodable(text)) {
    throw new PdfToolError('unsupportedCharacters');
  }
}

/**
 * Whether a font family can render the text.
 *
 * The three standard families are limited to WinAnsi; Noto Sans reaches beyond
 * it into Greek and Cyrillic, which is why picking it is the way to type those.
 */
export function supportsText(text: string, family: FontFamily): boolean {
  return family === 'noto'
    ? isNotoEncodable(text)
    : isWinAnsiEncodable(text);
}

export function assertDrawableWith(text: string, family: FontFamily): void {
  if (!supportsText(text, family)) {
    throw new PdfToolError('unsupportedCharacters');
  }
}
