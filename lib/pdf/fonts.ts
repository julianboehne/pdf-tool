import { StandardFonts, type PDFDocument, type PDFFont } from '@cantoo/pdf-lib';
import { PdfToolError } from './errors';

export type FontFamily = 'helvetica' | 'times' | 'courier' | 'noto';

export interface FontChoice {
  family: FontFamily;
  bold: boolean;
  italic: boolean;
}

export const FONT_FAMILIES: FontFamily[] = [
  'helvetica',
  'times',
  'courier',
  'noto',
];

/** CSS stacks used to mirror each PDF font in the on-screen editor. */
export const CSS_FONT_STACKS: Record<FontFamily, string> = {
  helvetica: 'Helvetica, Arial, sans-serif',
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
  noto: '"Noto Sans", system-ui, sans-serif',
};

const STANDARD: Record<
  Exclude<FontFamily, 'noto'>,
  Record<'regular' | 'bold' | 'italic' | 'boldItalic', StandardFonts>
> = {
  helvetica: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  times: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
  courier: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
};

const NOTO_FILES: Record<'regular' | 'bold' | 'italic' | 'boldItalic', string> = {
  regular: 'NotoSans-Regular.ttf',
  bold: 'NotoSans-Bold.ttf',
  italic: 'NotoSans-Italic.ttf',
  boldItalic: 'NotoSans-BoldItalic.ttf',
};

function variantOf(choice: FontChoice) {
  if (choice.bold && choice.italic) return 'boldItalic' as const;
  if (choice.bold) return 'bold' as const;
  if (choice.italic) return 'italic' as const;
  return 'regular' as const;
}

// Downloaded font files, shared across documents in the session.
const fileCache = new Map<string, Promise<ArrayBuffer>>();

// Embedded fonts, per document — embedding the same face twice would duplicate
// the font programme inside the output file.
const embedCache = new WeakMap<PDFDocument, Map<string, PDFFont>>();

const fontkitReady = new WeakSet<PDFDocument>();

async function loadNotoBytes(file: string): Promise<ArrayBuffer> {
  let pending = fileCache.get(file);

  if (!pending) {
    pending = fetch(`/fonts/${file}`).then((response) => {
      if (!response.ok) throw new PdfToolError('fontUnavailable');
      return response.arrayBuffer();
    });
    fileCache.set(file, pending);
  }

  return pending;
}

/**
 * Returns the embedded font for a choice, loading and subsetting Noto Sans on
 * demand.
 *
 * The three standard families need no font programme at all — every PDF reader
 * has them — so they stay free. Noto Sans costs a ~560 kB download the first
 * time it is picked, but `subset: true` means only the glyphs actually used are
 * written into the output file (single-digit kB in practice).
 */
export async function resolveFont(
  doc: PDFDocument,
  choice: FontChoice,
): Promise<PDFFont> {
  const variant = variantOf(choice);
  const key = `${choice.family}:${variant}`;

  let perDoc = embedCache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    embedCache.set(doc, perDoc);
  }

  const cached = perDoc.get(key);
  if (cached) return cached;

  let font: PDFFont;

  if (choice.family === 'noto') {
    if (!fontkitReady.has(doc)) {
      // fontkit ships a browser build and is only pulled in when a custom font
      // is actually requested, so the base bundle never carries it.
      const fontkit = await import('fontkit');
      doc.registerFontkit(fontkit as never);
      fontkitReady.add(doc);
    }

    const bytes = await loadNotoBytes(NOTO_FILES[variant]);
    font = await doc.embedFont(new Uint8Array(bytes), { subset: true });
  } else {
    font = await doc.embedFont(STANDARD[choice.family][variant]);
  }

  perDoc.set(key, font);
  return font;
}

/**
 * Unicode ranges Noto Sans covers for our purposes. Checked as ranges rather
 * than by loading the font, so the editor can validate while typing without a
 * 560 kB download.
 *
 * Deliberately conservative: it is better to reject a character that would have
 * worked than to promise one that silently renders as a blank box. CJK and
 * emoji genuinely are not in this font.
 */
const NOTO_RANGES: Array<[number, number]> = [
  [0x0020, 0x007e], // Basic Latin
  [0x00a0, 0x024f], // Latin-1 Supplement, Latin Extended-A/B
  [0x0370, 0x03ff], // Greek and Coptic
  [0x0400, 0x04ff], // Cyrillic
  [0x1e00, 0x1eff], // Latin Extended Additional
  [0x2010, 0x205e], // General Punctuation
  [0x20a0, 0x20bf], // Currency Symbols
  [0x2190, 0x21ff], // Arrows
  [0x2200, 0x22ff], // Mathematical Operators
];

export function isNotoEncodable(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code === 0x0a) continue;

    if (!NOTO_RANGES.some(([from, to]) => code >= from && code <= to)) {
      return false;
    }
  }

  return true;
}
