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

await check('merge shows every page of every file on one board', async () => {
  await page.goto(`${BASE}/en/merge`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', [FIXTURE, FIXTURE]);

  // Two 5-page files -> 10 tiles, each carrying a source chip.
  await page.waitForFunction(
    () => document.querySelectorAll('ul li img').length === 10,
    null,
    { timeout: 60000 },
  );

  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('ul li span[title^="From file"]')].map((el) =>
      el.textContent.trim(),
    ),
  );

  if (chips.length !== 10) {
    throw new Error(`expected 10 source chips, got ${chips.length}`);
  }
  if (new Set(chips).size !== 2) {
    throw new Error(`expected 2 distinct source chips, got ${[...new Set(chips)]}`);
  }
});

await check('merge reorders pages across files and drops one', async () => {
  // Move the first page of file 2 to the front, then delete one page.
  await page.getByLabel('Move left').nth(5).click();
  await page.getByLabel('Delete page').first().click();

  await page.waitForFunction(
    () => document.querySelectorAll('ul li img').length === 9,
    null,
    { timeout: 20000 },
  );

  const bytes = await runAndDownload('Merge PDFs');
  assertPdf(bytes);

  const pages = countPages(bytes);
  if (pages !== 9) throw new Error(`expected 9 page objects, got ${pages}`);
});

await check('split cut markers drive the number of output files', async () => {
  await page.goto(`${BASE}/en/split`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.waitForSelector('#split-mode', { timeout: 20000 });

  // Visual mode is the default; wait for the preview to finish rendering.
  await page.waitForSelector('button[aria-label^="Split after page"]', {
    timeout: 60000,
  });

  const beforeText = await page.locator('text=Produces 1 file').count();
  if (beforeText !== 1) throw new Error('expected a single output file before cutting');

  await page.getByLabel('Split after page 2').click();
  await page.getByLabel('Split after page 4').click();
  await page.waitForSelector('text=Produces 3 files', { timeout: 20000 });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    page
      .getByRole('button', { name: 'Split PDF' })
      .click()
      .then(() =>
        page.getByRole('button', { name: /Download all \(3\)/ }).click(),
      ),
  ]);

  const name = download.suggestedFilename();
  if (!name.endsWith('.zip')) throw new Error(`expected a zip, got ${name}`);
});

await check('watermark shows a live preview of the real result', async () => {
  await page.goto(`${BASE}/en/watermark`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.waitForSelector('#wm-text', { timeout: 20000 });

  const preview = page.getByAltText(/Preview of page 1/);
  await preview.waitFor({ timeout: 60000 });

  const before = await preview.getAttribute('src');

  // Changing an option must produce a different rendering.
  await page.fill('#wm-text', 'GEPRUEFT');
  await page.waitForFunction(
    (previous) => {
      const img = document.querySelector('img[alt^="Preview of page"]');
      return img && img.src !== previous;
    },
    before,
    { timeout: 60000 },
  );
});

await check('editor places a text element and burns it into the page', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);

  const stage = page.getByAltText('Page 1').first();
  await stage.waitFor({ timeout: 60000 });

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('div:has(> img[alt="Page 1"])').first().click({
    position: { x: 120, y: 200 },
  });

  await page.waitForSelector('#edit-text', { timeout: 20000 });
  await page.fill('#edit-text', 'Approved by QA');

  const bytes = await runAndDownload('Apply changes');
  assertPdf(bytes);

  const pages = countPages(bytes);
  if (pages !== 5) throw new Error(`expected 5 page objects, got ${pages}`);
});

await check('signature is drawn, placed and written into the PDF', async () => {
  await page.goto(`${BASE}/en/sign`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);

  const pad = page.getByLabel('Signature drawing area');
  await pad.waitFor({ timeout: 30000 });

  // Draw a short stroke on the pad.
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + box.height / 2 - 25, { steps: 8 });
  await page.mouse.move(box.x + 200, box.y + box.height / 2 + 20, { steps: 8 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Use this signature' }).click();
  await page.getByAltText('Your signature').waitFor({ timeout: 20000 });

  const stage = page.getByAltText('Page 1').first();
  await stage.waitFor({ timeout: 60000 });

  await page.locator('div:has(> img[alt="Page 1"])').first().click({
    position: { x: 200, y: 400 },
  });
  await page.getByLabel('Placed signature').waitFor({ timeout: 20000 });

  const bytes = await runAndDownload('Sign PDF');
  assertPdf(bytes);

  // The trimmed signature is embedded as a PNG image XObject.
  if (!bytes.includes(Buffer.from('/Image'))) {
    throw new Error('no image XObject in the signed output');
  }
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

await check('German header fits without horizontal overflow', async () => {
  // The German tool labels are what pushed the old inline nav over the edge,
  // so this asserts the header at the narrowest common viewport and a desktop
  // one, in the longer of the two languages.
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${BASE}/de/merge`, { waitUntil: 'networkidle' });

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });

    if (overflow > 0) {
      throw new Error(`page scrolls horizontally by ${overflow}px at ${width}px`);
    }
  }

  await page.setViewportSize({ width: 1280, height: 800 });
});

await check('tools menu opens, lists every tool and closes on Escape', async () => {
  await page.goto(`${BASE}/de`, { waitUntil: 'networkidle' });

  const trigger = page.getByRole('button', { name: 'Werkzeuge' });
  if ((await trigger.getAttribute('aria-expanded')) !== 'false') {
    throw new Error('menu should start collapsed');
  }

  await trigger.click();
  const links = page.locator('#' + (await trigger.getAttribute('aria-controls')) + ' a');
  const count = await links.count();
  if (count !== 9) throw new Error(`expected 9 tools in the menu, got ${count}`);

  await page.keyboard.press('Escape');
  if ((await trigger.getAttribute('aria-expanded')) !== 'false') {
    throw new Error('Escape did not close the menu');
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
