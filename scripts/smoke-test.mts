/**
 * Functional smoke test for the PDF operations in lib/pdf.
 *
 * Run with `npm run test:smoke`. Covers everything that works without a DOM;
 * the pdf.js paths (thumbnails, rasterised compression) need a real canvas and
 * are exercised in the browser instead.
 */

import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

import { mergePdfs } from '../lib/pdf/merge.js';
import { splitPdf } from '../lib/pdf/split.js';
import { applyPageOps, extractPages } from '../lib/pdf/organize.js';
import { addWatermark } from '../lib/pdf/watermark.js';
import { addPageNumbers } from '../lib/pdf/pageNumbers.js';
import { protectPdf, removePassword } from '../lib/pdf/protect.js';
import { compressPdf } from '../lib/pdf/compress.js';
import { composePdf } from '../lib/pdf/compose.js';
import {
  applyAnnotations,
  lineEndpoints,
  sortForPainting,
  wrapText,
  type Annotation,
} from '../lib/pdf/annotate.js';
import { snapToGuides, centerOnPage } from '../lib/pdf/guides.js';
import { isNotoEncodable } from '../lib/pdf/fonts.js';
import { supportsText } from '../lib/pdf/text.js';
import { parsePageRanges, parsePageSelection } from '../lib/pdf/ranges.js';
import { isWinAnsiEncodable } from '../lib/pdf/text.js';
import { getPageCount, isEncrypted, loadPdf } from '../lib/pdf/load.js';
import { PdfToolError } from '../lib/pdf/errors.js';
import type { PdfSource } from '../lib/pdf/types.js';

let failures = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error instanceof Error ? error.message : error}`);
  }
}

/** Builds an n-page PDF with a visible page label on each page. */
async function fixture(pages: number, tag: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]); // A4 in points
    page.drawText(`${tag} page ${i + 1}`, { x: 60, y: 760, size: 24, font });
  }

  return doc.save();
}

function source(bytes: Uint8Array, name: string): PdfSource {
  return { id: name, name, bytes, size: bytes.byteLength };
}

async function expectError(
  key: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof PdfToolError, `expected PdfToolError, got ${error}`);
    assert.equal(error.key, key);
    return;
  }
  throw new Error(`expected the call to throw "${key}"`);
}

console.log('lib/pdf smoke test\n');

const a = await fixture(5, 'A');
const b = await fixture(3, 'B');

await test('fixture documents are readable', async () => {
  assert.equal(await getPageCount(a), 5);
  assert.equal(await getPageCount(b), 3);
});

await test('merge concatenates in the given order', async () => {
  const merged = await mergePdfs([source(a, 'a.pdf'), source(b, 'b.pdf')]);
  assert.equal(await getPageCount(merged), 8);
});

await test('merge rejects an empty selection', async () => {
  await expectError('emptySelection', () => mergePdfs([]));
});

await test('split by range produces one file per group', async () => {
  const parts = await splitPdf(a, 'a.pdf', { mode: 'ranges', ranges: '1-2, 3-5' });
  assert.equal(parts.length, 2);
  assert.equal(await getPageCount(parts[0].bytes), 2);
  assert.equal(await getPageCount(parts[1].bytes), 3);
  assert.equal(parts[0].name, 'a_1-2.pdf');
  assert.equal(parts[1].name, 'a_3-5.pdf');
});

await test('split every N pages covers the whole document', async () => {
  const parts = await splitPdf(a, 'a.pdf', { mode: 'everyN', chunkSize: 2 });
  assert.equal(parts.length, 3);
  assert.deepEqual(
    await Promise.all(parts.map((p) => getPageCount(p.bytes))),
    [2, 2, 1],
  );
});

await test('split one file per page', async () => {
  const parts = await splitPdf(a, 'a.pdf', { mode: 'single' });
  assert.equal(parts.length, 5);
});

await test('page ranges parse and validate', async () => {
  assert.deepEqual(parsePageRanges('1-3', 10), [[0, 1, 2]]);
  assert.deepEqual(parsePageRanges('2, 5', 10), [[1], [4]]);
  assert.deepEqual(parsePageRanges('8-', 10), [[7, 8, 9]]);
  assert.deepEqual(parsePageRanges('-3', 10), [[0, 1, 2]]);
  assert.deepEqual(parsePageSelection('3, 1-2, 2', 10), [0, 1, 2]);

  for (const bad of ['', '0', '11', '5-2', 'abc']) {
    assert.throws(() => parsePageRanges(bad, 10), PdfToolError, `"${bad}"`);
  }
});

await test('organize deletes, reorders and rotates', async () => {
  const output = await applyPageOps(a, [
    { sourceIndex: 4, rotation: 90 },
    { sourceIndex: 0, rotation: 0 },
    { sourceIndex: 2, rotation: 180 },
  ]);

  const doc = await loadPdf(output);
  assert.equal(doc.getPageCount(), 3);
  assert.equal(doc.getPage(0).getRotation().angle, 90);
  assert.equal(doc.getPage(1).getRotation().angle, 0);
  assert.equal(doc.getPage(2).getRotation().angle, 180);
});

await test('extract keeps only the chosen pages', async () => {
  const output = await extractPages(a, [1, 3]);
  assert.equal(await getPageCount(output), 2);
});

await test('watermark keeps the page count and page size', async () => {
  const output = await addWatermark(a, {
    text: 'Vertraulich — Entwurf',
    layout: 'diagonal',
    fontSize: 48,
    opacity: 0.25,
    color: '#7c3aed',
  });

  const doc = await loadPdf(output);
  assert.equal(doc.getPageCount(), 5);
  assert.equal(Math.round(doc.getPage(0).getSize().width), 595);
});

await test('watermark restricted to a page subset still writes a valid file', async () => {
  const output = await addWatermark(a, {
    text: 'DRAFT',
    layout: 'tile',
    fontSize: 24,
    opacity: 0.15,
    color: '#334155',
    pageIndices: [0, 2],
  });
  assert.equal(await getPageCount(output), 5);
});

await test('WinAnsi encodability check matches the standard font', async () => {
  assert.equal(isWinAnsiEncodable('Vertraulich — Entwurf für Müller & Co.'), true);
  assert.equal(isWinAnsiEncodable('€ „Zitat" • 50 %'), true);
  assert.equal(isWinAnsiEncodable('機密'), false);
  assert.equal(isWinAnsiEncodable('locked 🔒'), false);
  assert.equal(isWinAnsiEncodable('Ελληνικά'), false);
});

await test('watermark rejects characters the standard font cannot encode', async () => {
  // @cantoo/pdf-lib drops these silently rather than throwing, so the guard in
  // lib/pdf/text.ts is the only thing standing between the user and a blank
  // watermark. This test is what keeps that guard honest.
  await expectError('unsupportedCharacters', () =>
    addWatermark(a, {
      text: '機密',
      layout: 'horizontal',
      fontSize: 32,
      opacity: 0.3,
      color: '#000000',
    }),
  );
});

await test('page numbers are written with localised wording', async () => {
  const output = await addPageNumbers(a, {
    position: 'bottom-center',
    format: 'pageOfTotal',
    fontSize: 10,
    margin: 28,
    color: '#334155',
    startAt: 1,
    skipFirstPage: true,
    words: { page: 'Seite', of: 'von' },
  });
  assert.equal(await getPageCount(output), 5);
});

await test('lossless compression produces a readable document', async () => {
  const result = await compressPdf(a, {
    mode: 'lossless',
    dpi: 150,
    quality: 0.6,
    grayscale: false,
  });
  assert.equal(await getPageCount(result.bytes), 5);
  assert.equal(result.originalSize, a.byteLength);
  assert.ok(result.compressedSize > 0);
});

await test('protect encrypts the document', async () => {
  const output = await protectPdf(a, {
    userPassword: 'geheim123',
    permissions: {
      printing: true,
      modifying: false,
      copying: false,
      annotating: false,
    },
  });

  assert.equal(await isEncrypted(output), true);
  await expectError('encrypted', () => getPageCount(output));
});

await test('protect requires a password', async () => {
  await expectError('passwordMissing', () =>
    protectPdf(a, {
      userPassword: '',
      permissions: {
        printing: true,
        modifying: true,
        copying: true,
        annotating: true,
      },
    }),
  );
});

await test('removePassword round-trips with the correct password', async () => {
  const encrypted = await protectPdf(a, {
    userPassword: 'geheim123',
    ownerPassword: 'besitzer456',
    permissions: {
      printing: true,
      modifying: false,
      copying: false,
      annotating: false,
    },
  });

  const decrypted = await removePassword(encrypted, 'geheim123');
  assert.equal(await isEncrypted(decrypted), false);
  assert.equal(await getPageCount(decrypted), 5);
});

await test('removePassword rejects a wrong password', async () => {
  const encrypted = await protectPdf(a, {
    userPassword: 'geheim123',
    permissions: {
      printing: true,
      modifying: false,
      copying: false,
      annotating: false,
    },
  });

  await expectError('wrongPassword', () => removePassword(encrypted, 'falsch'));
});

await test('compose interleaves pages from several documents', async () => {
  const sa = source(a, 'a.pdf');
  const sb = source(b, 'b.pdf');

  const output = await composePdf(
    [sa, sb],
    [
      { sourceId: sa.id, sourceIndex: 4, rotation: 90 },
      { sourceId: sb.id, sourceIndex: 0, rotation: 0 },
      { sourceId: sa.id, sourceIndex: 0, rotation: 180 },
      { sourceId: sb.id, sourceIndex: 2, rotation: 0 },
    ],
  );

  const doc = await loadPdf(output);
  assert.equal(doc.getPageCount(), 4);
  assert.equal(doc.getPage(0).getRotation().angle, 90);
  assert.equal(doc.getPage(2).getRotation().angle, 180);
});

await test('compose can repeat the same source page', async () => {
  const sa = source(a, 'a.pdf');

  const output = await composePdf(
    [sa],
    [
      { sourceId: sa.id, sourceIndex: 1, rotation: 0 },
      { sourceId: sa.id, sourceIndex: 1, rotation: 90 },
    ],
  );

  const doc = await loadPdf(output);
  assert.equal(doc.getPageCount(), 2);
  assert.equal(doc.getPage(0).getRotation().angle, 0);
  assert.equal(doc.getPage(1).getRotation().angle, 90);
});

await test('compose rejects an unknown source id', async () => {
  await expectError('emptySelection', () =>
    composePdf([source(a, 'a.pdf')], [
      { sourceId: 'nope', sourceIndex: 0, rotation: 0 },
    ]),
  );
});

await test('split groups can be defined by visual cut points', async () => {
  const parts = await splitPdf(a, 'a.pdf', { mode: 'visual', cuts: [1, 3] });
  assert.equal(parts.length, 3);
  assert.deepEqual(
    await Promise.all(parts.map((p) => getPageCount(p.bytes))),
    [2, 2, 1],
  );
});

await test('visual split with no cuts yields the whole document', async () => {
  const parts = await splitPdf(a, 'a.pdf', { mode: 'visual', cuts: [] });
  assert.equal(parts.length, 1);
  assert.equal(await getPageCount(parts[0].bytes), 5);
});

await test('annotations are drawn onto the page', async () => {
  // A 1x1 transparent PNG — enough to exercise the embed path.
  const pngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const annotations: Annotation[] = [
    {
      id: 'text-1',
      type: 'text',
      page: 0,
      x: 60,
      y: 600,
      width: 300,
      height: 60,
      text: 'Nachträglich ergänzt',
      fontSize: 14,
      color: '#111827',
      fontFamily: 'helvetica',
      bold: true,
      italic: false,
      align: 'left',
      background: null,
    },
    {
      id: 'cover-1',
      type: 'rect',
      page: 1,
      x: 50,
      y: 700,
      width: 220,
      height: 24,
      fill: '#ffffff',
      stroke: null,
      strokeWidth: 1,
      opacity: 1,
    },
    {
      id: 'ellipse-1',
      type: 'ellipse',
      page: 2,
      x: 100,
      y: 400,
      width: 180,
      height: 120,
      fill: null,
      stroke: '#dc2626',
      strokeWidth: 2,
      opacity: 1,
    },
    {
      id: 'sig-1',
      type: 'image',
      page: 4,
      x: 320,
      y: 90,
      width: 170,
      height: 60,
      dataUrl: pngDataUrl,
    },
  ];

  const output = await applyAnnotations(a, annotations);
  const doc = await loadPdf(output);

  assert.equal(doc.getPageCount(), 5);
  // Page geometry must survive untouched — annotations draw, they do not resize.
  assert.equal(Math.round(doc.getPage(0).getSize().width), 595);
  assert.ok(output.byteLength > a.byteLength);
});

await test('annotations reject text the standard font cannot encode', async () => {
  await expectError('unsupportedCharacters', () =>
    applyAnnotations(a, [
      {
        id: 'text-bad',
        type: 'text',
        page: 0,
        x: 50,
        y: 500,
        width: 200,
        height: 40,
        text: '署名',
        fontSize: 14,
        color: '#000000',
        fontFamily: 'helvetica',
        bold: false,
        italic: false,
        align: 'left',
        background: null,
      },
    ]),
  );
});

await test('annotations reject an unsupported image format', async () => {
  await expectError('unsupportedImage', () =>
    applyAnnotations(a, [
      {
        id: 'img-bad',
        type: 'image',
        page: 0,
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      },
    ]),
  );
});

await test('applying no annotations is an error, not a silent no-op', async () => {
  await expectError('emptySelection', () => applyAnnotations(a, []));
});

await test('text wraps greedily against measured widths', async () => {
  // 10 units per character keeps the arithmetic checkable by hand.
  const font = { widthOfTextAtSize: (s: string, size: number) => s.length * size };

  assert.deepEqual(wrapText('aaa bbb ccc', 70, 10, font), ['aaa bbb', 'ccc']);
  assert.deepEqual(wrapText('one\ntwo', 1000, 10, font), ['one', 'two']);
  // A single word wider than the box overflows rather than being cut apart.
  assert.deepEqual(wrapText('enormously', 30, 10, font), ['enormously']);
  assert.deepEqual(wrapText('a b', 1000, 10, font), ['a b']);
});

await test('text alignment and background reach the output', async () => {
  const output = await applyAnnotations(a, [
    {
      id: 'text-aligned',
      type: 'text',
      page: 0,
      x: 100,
      y: 500,
      width: 300,
      height: 80,
      text: 'Zentriert gesetzt mit Hintergrund',
      fontSize: 14,
      color: '#111827',
      fontFamily: 'times',
      bold: false,
      italic: true,
      align: 'center',
      background: '#fef08a',
    },
  ]);

  const doc = await loadPdf(output);
  assert.equal(doc.getPageCount(), 5);
  assert.ok(output.byteLength > a.byteLength);
});

await test('highlight is written with the Multiply blend mode', async () => {
  const output = await applyAnnotations(a, [
    {
      id: 'hl-1',
      type: 'highlight',
      page: 0,
      x: 60,
      y: 750,
      width: 200,
      height: 16,
      color: '#fde047',
    },
  ]);

  // Multiply is what keeps the covered text readable; if it silently fell back
  // to normal painting the marker would bury the words underneath.
  const content = Buffer.from(output).toString('latin1');
  assert.ok(content.includes('/Multiply'), 'expected a /Multiply blend mode in the output');
});

await test('highlights are sorted to the back regardless of insertion order', async () => {
  // Checking the pure ordering function rather than sniffing the compressed
  // content stream: the assertion stays about the rule, not about how pdf-lib
  // happens to serialise it.
  const text: Annotation = {
    id: 'text-front',
    type: 'text',
    page: 0,
    x: 60,
    y: 600,
    width: 200,
    height: 30,
    text: 'Vorn',
    fontSize: 12,
    color: '#000000',
    fontFamily: 'helvetica',
    bold: false,
    italic: false,
    align: 'left',
    background: null,
  };

  const marker: Annotation = {
    id: 'hl-back',
    type: 'highlight',
    page: 0,
    x: 60,
    y: 600,
    width: 200,
    height: 30,
    color: '#fde047',
  };

  // Marker added *after* the text must still be painted first.
  assert.deepEqual(
    sortForPainting([text, marker]).map((item) => item.id),
    ['hl-back', 'text-front'],
  );

  // Relative order within each group is preserved.
  const second = { ...marker, id: 'hl-2' };
  assert.deepEqual(
    sortForPainting([marker, text, second]).map((item) => item.id),
    ['hl-back', 'hl-2', 'text-front'],
  );
});

await test('line endpoints follow the diagonal that was drawn', async () => {
  const box = { id: 'l', page: 0, x: 100, y: 200, width: 60, height: 40 };

  // Dragging up-right runs along the ↗ diagonal…
  assert.deepEqual(
    lineEndpoints({
      ...box,
      type: 'line',
      fromCorner: 'bottom-left',
      stroke: '#000000',
      strokeWidth: 2,
      opacity: 1,
    }),
    { start: { x: 100, y: 200 }, end: { x: 160, y: 240 } },
  );

  // …and dragging down-right along the ↘ one. Without this an arrow drawn
  // downwards would point the wrong way.
  assert.deepEqual(
    lineEndpoints({
      ...box,
      type: 'arrow',
      fromCorner: 'top-left',
      stroke: '#000000',
      strokeWidth: 2,
      opacity: 1,
    }),
    { start: { x: 100, y: 240 }, end: { x: 160, y: 200 } },
  );
});

await test('lines and arrows are drawn into the document', async () => {
  const output = await applyAnnotations(a, [
    {
      id: 'line-1',
      type: 'line',
      page: 0,
      x: 80,
      y: 400,
      width: 200,
      height: 0,
      fromCorner: 'bottom-left',
      stroke: '#2563eb',
      strokeWidth: 2,
      opacity: 1,
    },
    {
      id: 'arrow-1',
      type: 'arrow',
      page: 1,
      x: 80,
      y: 300,
      width: 150,
      height: 90,
      fromCorner: 'top-left',
      stroke: '#dc2626',
      strokeWidth: 3,
      opacity: 0.8,
    },
  ]);

  const doc = await loadPdf(output);
  assert.equal(doc.getPageCount(), 5);
  assert.ok(output.byteLength > a.byteLength);
});

await test('Noto Sans coverage check accepts Greek and Cyrillic, rejects CJK', async () => {
  assert.equal(isNotoEncodable('Grüße — 50 € «2024»'), true);
  assert.equal(isNotoEncodable('Ελληνικά'), true);
  assert.equal(isNotoEncodable('Кириллица'), true);
  assert.equal(isNotoEncodable('機密'), false);
  assert.equal(isNotoEncodable('🔒'), false);

  // The standard families stay limited to WinAnsi, which is the whole reason
  // Noto Sans is offered at all.
  assert.equal(supportsText('Ελληνικά', 'helvetica'), false);
  assert.equal(supportsText('Ελληνικά', 'noto'), true);
  assert.equal(supportsText('Grüße', 'helvetica'), true);
});

await test('alignment guides snap to the page centre', async () => {
  const page = { width: 600, height: 800 };
  // Box centre at 296 — 4 points shy of the page centre at 300.
  const moving = { x: 196, y: 100, width: 200, height: 50 };

  const snapped = snapToGuides(moving, [], page, 6);

  assert.equal(snapped.rect.x, 200, 'should pull to a centred x');
  assert.ok(
    snapped.guides.some((g) => g.axis === 'x' && g.kind === 'page-center'),
    'should report the page-centre guide',
  );
});

await test('alignment guides snap to another element', async () => {
  const page = { width: 600, height: 800 };
  const other = { x: 100, y: 400, width: 120, height: 40 };
  // Left edge 3 points away from the other element's left edge.
  const moving = { x: 103, y: 200, width: 80, height: 30 };

  const snapped = snapToGuides(moving, [other], page, 6);
  assert.equal(snapped.rect.x, 100);
  assert.ok(snapped.guides.some((g) => g.axis === 'x' && g.kind === 'element'));
});

await test('alignment guides leave distant elements alone', async () => {
  const page = { width: 600, height: 800 };
  const moving = { x: 40, y: 40, width: 100, height: 20 };

  const snapped = snapToGuides(moving, [], page, 6);
  assert.deepEqual(snapped.rect, moving);
  assert.equal(snapped.guides.length, 0);
});

await test('centring on the page is exact', async () => {
  const centred = centerOnPage(
    { x: 0, y: 0, width: 200, height: 100 },
    { width: 600, height: 800 },
    'both',
  );
  assert.deepEqual(centred, { x: 200, y: 350, width: 200, height: 100 });
});

await test('a non-PDF input is reported as invalid', async () => {
  const junk = new TextEncoder().encode('this is definitely not a pdf');
  await expectError('invalidPdf', () => getPageCount(junk));
});

console.log(
  failures === 0
    ? '\nAll checks passed.'
    : `\n${failures} check(s) failed.`,
);

process.exit(failures === 0 ? 0 : 1);
