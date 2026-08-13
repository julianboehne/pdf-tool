/**
 * End-to-end checks for the parts that only exist in a browser: the pdf.js
 * worker, canvas rendering and the download path. Everything else is covered by
 * scripts/smoke-test.mts, which runs far faster.
 *
 * Needs a running server and a Playwright browser, so it is driven from a
 * container rather than an npm script — see README, "Tests".
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL;
const FIXTURE = process.env.FIXTURE ?? '/work/tests/fixture.pdf';

let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

/** Counts page objects without parsing the whole document. */
function countPages(bytes) {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
}

function assertPdf(bytes) {
  if (bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('download is not a PDF');
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

/** Clicks the tool's action button, then the download button in the result. */
async function runAndDownload(actionName, timeout = 45000) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout }),
    page
      .getByRole('button', { name: actionName })
      .click()
      .then(() =>
        page
          .getByRole('button', { name: 'Download', exact: true })
          .click({ timeout }),
      ),
  ]);

  return readFileSync(await download.path());
}

console.log('browser smoke test\n');

await check('organize renders one thumbnail per page via pdf.js', async () => {
  await page.goto(`${BASE}/en/organize`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.waitForFunction(
    () => document.querySelectorAll('ul li img').length === 5,
    null,
    { timeout: 45000 },
  );

  const painted = await page.evaluate(() =>
    [...document.querySelectorAll('ul li img')].every(
      (img) => img.src.startsWith('data:image/png') && img.src.length > 2000,
    ),
  );

  if (!painted) throw new Error('thumbnails are blank or missing data URLs');
});

await check('deleting a page and saving yields a 4-page download', async () => {
  await page.getByLabel('Delete page').first().click();

  const remaining = await page.locator('ul li img').count();
  if (remaining !== 4) {
    throw new Error(`expected 4 pages after delete, got ${remaining}`);
  }

  const bytes = await runAndDownload('Save changes');
  assertPdf(bytes);

  const pages = countPages(bytes);
  if (pages !== 4) throw new Error(`expected 4 page objects, got ${pages}`);
});

await check('compress (rasterize) embeds JPEG streams', async () => {
  await page.goto(`${BASE}/en/compress`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.waitForSelector('#compress-mode', { timeout: 20000 });
  await page.selectOption('#compress-mode', 'rasterize');

  const bytes = await runAndDownload('Compress PDF', 90000);
  assertPdf(bytes);

  if (!bytes.includes(Buffer.from('DCTDecode'))) {
    throw new Error('no JPEG stream in rasterized output');
  }
});

await check('merge combines two files client-side', async () => {
  await page.goto(`${BASE}/en/merge`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', [FIXTURE, FIXTURE]);
  await page.waitForSelector('li', { timeout: 20000 });

  const bytes = await runAndDownload('Merge PDFs');
  assertPdf(bytes);

  const pages = countPages(bytes);
  if (pages !== 10) throw new Error(`expected 10 page objects, got ${pages}`);
});

await check('protect writes an encryption dictionary', async () => {
  await page.goto(`${BASE}/en/protect`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.waitForSelector('#pr-user', { timeout: 20000 });
  await page.fill('#pr-user', 'geheim123');
  await page.fill('#pr-confirm', 'geheim123');

  const bytes = await runAndDownload('Protect PDF');
  assertPdf(bytes);

  if (!bytes.includes(Buffer.from('/Encrypt'))) {
    throw new Error('output has no /Encrypt dictionary');
  }
});

await check('German locale renders German UI', async () => {
  await page.goto(`${BASE}/de/watermark`, { waitUntil: 'networkidle' });

  const heading = await page.locator('h1').first().innerText();
  if (!heading.includes('Wasserzeichen')) {
    throw new Error(`unexpected heading: ${heading}`);
  }
});

await check('no uncaught JavaScript errors on any exercised page', async () => {
  const real = consoleErrors.filter((entry) => !/favicon|404/i.test(entry));
  if (real.length > 0) throw new Error(real.slice(0, 3).join(' | '));
});

await browser.close();

console.log(
  failures === 0
    ? '\nAll browser checks passed.'
    : `\n${failures} check(s) failed.`,
);

process.exit(failures === 0 ? 0 : 1);
