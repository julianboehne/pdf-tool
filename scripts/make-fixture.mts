/**
 * Writes tests/fixture.pdf — a 5-page A4 document with text and a coloured
 * block on each page, so both the text path and the raster path have something
 * real to work on. Regenerate with `npm run test:fixture`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);

for (let i = 0; i < 5; i++) {
  const page = doc.addPage([595, 842]); // A4 in points
  page.drawRectangle({
    x: 40,
    y: 500,
    width: 515,
    height: 280,
    color: rgb(0.2 + i * 0.15, 0.4, 0.85),
  });
  page.drawText(`Fixture page ${i + 1}`, { x: 60, y: 300, size: 36, font });
}

mkdirSync('tests', { recursive: true });
writeFileSync('tests/fixture.pdf', await doc.save());

console.log('tests/fixture.pdf written (5 pages)');
