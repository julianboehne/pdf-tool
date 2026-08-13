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
