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

/** The page surface itself — clicking it is how elements get placed. */
const stageLocator = () => page.locator('div:has(> img[alt="Page 1"])').first();

/**
 * Scrolls the page surface to a known position and returns its box.
 *
 * `locator.click()` scrolls its target into view on its own, but `page.mouse`
 * does not — and an A4 stage is taller than the viewport, so raw drag
 * coordinates silently land outside it and the events go nowhere.
 */
async function positionStage() {
  const stage = stageLocator();

  await page.evaluate(async () => {
    const element = document.querySelector('img[alt="Page 1"]')?.parentElement;
    if (!element) return;

    // globals.css sets `scroll-behavior: smooth`, so an animated scroll would
    // still be in flight when the box is measured. Jump instantly instead.
    window.scrollTo({
      top: window.scrollY + element.getBoundingClientRect().top - 160,
      behavior: 'instant',
    });

    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  });

  return stage.boundingBox();
}

/** Drags inside the page surface, failing loudly if a point is off-screen. */
async function dragOnStage(from, to) {
  const box = await positionStage();
  const viewport = page.viewportSize();

  const points = [from, to].map((point) => ({
    x: box.x + point.x,
    y: box.y + point.y,
  }));

  for (const point of points) {
    if (point.y < 0 || point.y > viewport.height) {
      throw new Error(
        `drag point y=${Math.round(point.y)} lies outside the ${viewport.height}px viewport — ` +
          'the stage moved, so this drag would have hit nothing',
      );
    }
  }

  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y, { steps: 10 });
  await page.mouse.up();
}

await check('editor edits text in place on the page', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.getByAltText('Page 1').first().waitFor({ timeout: 60000 });

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await stageLocator().click({ position: { x: 120, y: 200 } });

  // A new box drops straight into typing, on the page itself — the old build
  // put the only editable field ~700px below the fold.
  const editor = page.locator('[role="group"] textarea');
  await editor.waitFor({ timeout: 20000 });

  const editorBox = await editor.boundingBox();
  const stageBox = await stageLocator().boundingBox();
  if (
    editorBox.y < stageBox.y ||
    editorBox.y > stageBox.y + stageBox.height
  ) {
    throw new Error('the inline editor is not on the page surface');
  }

  await page.keyboard.type('Approved by QA');

  await page.getByLabel('Font', { exact: true }).selectOption('times');
  await page.getByLabel('Font size').selectOption('20');
  await page.getByLabel('Bold').click();
  await page.getByLabel('Centre').click();

  const bytes = await runAndDownload('Apply changes');
  assertPdf(bytes);

  const content = bytes.toString('latin1');
  if (!content.includes('Times')) {
    throw new Error('expected a Times font resource in the output');
  }
  if (countPages(bytes) !== 5) throw new Error('page count changed');
});

await check('double-click reopens an existing text box for editing', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.getByAltText('Page 1').first().waitFor({ timeout: 60000 });

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await stageLocator().click({ position: { x: 120, y: 200 } });
  await page.locator('[role="group"] textarea').waitFor({ timeout: 20000 });
  await page.keyboard.type('First');

  // Click away to leave editing, then double-click to come back.
  await stageLocator().click({ position: { x: 400, y: 600 } });
  if ((await page.locator('[role="group"] textarea').count()) !== 0) {
    throw new Error('clicking the page did not end editing');
  }

  await page.getByRole('group', { name: 'Text box' }).first().dblclick();
  const editor = page.locator('[role="group"] textarea');
  await editor.waitFor({ timeout: 20000 });

  if ((await editor.inputValue()) !== 'First') {
    throw new Error('reopened editor lost the existing text');
  }

  await page.keyboard.type(' and second');
  await page.keyboard.press('Escape');

  const bytes = await runAndDownload('Apply changes');
  assertPdf(bytes);
});

await check('Delete removes the selected element', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.getByAltText('Page 1').first().waitFor({ timeout: 60000 });

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await stageLocator().click({ position: { x: 120, y: 200 } });
  await page.locator('[role="group"] textarea').waitFor({ timeout: 20000 });
  await page.keyboard.type('Delete me');
  await page.keyboard.press('Escape');

  // Selecting by click used to leave focus on the page, so the frame never
  // received the key at all.
  await page.getByRole('group', { name: 'Text box' }).first().click();
  await page.keyboard.press('Delete');

  if ((await page.getByRole('group', { name: 'Text box' }).count()) !== 0) {
    throw new Error('Delete did not remove the selected element');
  }
});

await check('Ctrl+C and Ctrl+V duplicate an element', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.getByAltText('Page 1').first().waitFor({ timeout: 60000 });

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await stageLocator().click({ position: { x: 120, y: 200 } });
  await page.locator('[role="group"] textarea').waitFor({ timeout: 20000 });
  await page.keyboard.type('Copy me');
  await page.keyboard.press('Escape');

  await page.getByRole('group', { name: 'Text box' }).first().click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(300);

  const count = await page.getByRole('group', { name: 'Text box' }).count();
  if (count !== 2) throw new Error(`expected 2 text boxes after paste, got ${count}`);

  const bytes = await runAndDownload('Apply changes');
  assertPdf(bytes);
});

await check('shapes menu offers several shapes and draws an arrow', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.getByAltText('Page 1').first().waitFor({ timeout: 60000 });

  const shapes = page.getByRole('button', { name: 'Shapes' });
  await shapes.click();

  for (const shape of ['Rectangle', 'Ellipse', 'Line', 'Arrow']) {
    if ((await page.getByRole('button', { name: shape, exact: true }).count()) === 0) {
      throw new Error(`the shapes menu is missing "${shape}"`);
    }
  }

  await page.getByRole('button', { name: 'Arrow', exact: true }).click();

  // Drag downwards, so the head has to land at the lower end.
  await dragOnStage({ x: 80, y: 200 }, { x: 300, y: 380 });

  await page.getByRole('group', { name: 'Arrow' }).first().waitFor({ timeout: 20000 });

  const bytes = await runAndDownload('Apply changes');
  assertPdf(bytes);
  if (countPages(bytes) !== 5) throw new Error('page count changed');
});

await check('marker draws a Multiply-blended highlight', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.getByAltText('Page 1').first().waitFor({ timeout: 60000 });

  await page.getByRole('button', { name: 'Marker', exact: true }).click();
  await page.getByLabel('Green').click();

  // Drag across the page the way a highlighter is used.
  await dragOnStage({ x: 60, y: 220 }, { x: 320, y: 226 });

  const bytes = await runAndDownload('Apply changes');
  assertPdf(bytes);

  if (!bytes.includes(Buffer.from('/Multiply'))) {
    throw new Error('highlight was not written with the Multiply blend mode');
  }
});

await check('Noto Sans is fetched, subset and embedded in the browser', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.getByAltText('Page 1').first().waitFor({ timeout: 60000 });

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await stageLocator().click({ position: { x: 100, y: 260 } });
  await page.locator('[role="group"] textarea').waitFor({ timeout: 20000 });

  // Greek is the point of the embedded font: the standard families cannot
  // encode it at all.
  await page.keyboard.type('Ελληνικά Grüße');
  await page.keyboard.press('Escape');
  await page.getByRole('group', { name: 'Text box' }).first().click();
  await page.getByLabel('Font', { exact: true }).selectOption('noto');

  const bytes = await runAndDownload('Apply changes', 90000);
  assertPdf(bytes);

  const content = bytes.toString('latin1');
  if (!/NotoSans/i.test(content)) {
    throw new Error('no NotoSans font programme in the output');
  }
  // Subsetting is what keeps a 557 kB font from landing in every export.
  if (bytes.length > 400_000) {
    throw new Error(`output looks unsubset: ${bytes.length} bytes`);
  }
});

await check('alignment guides appear and snap an element to the page centre', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.getByAltText('Page 1').first().waitFor({ timeout: 60000 });

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await stageLocator().click({ position: { x: 80, y: 300 } });
  await page.locator('[role="group"] textarea').waitFor({ timeout: 20000 });
  await page.keyboard.type('Align me');
  await page.keyboard.press('Escape');

  const stageBox = await positionStage();
  const element = page.getByRole('group', { name: 'Text box' }).first();
  const elementBox = await element.boundingBox();

  // Drag the element's centre to just beside the page centre and hold there.
  const targetX = stageBox.x + stageBox.width / 2 + 3;
  await page.mouse.move(
    elementBox.x + elementBox.width / 2,
    elementBox.y + elementBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(targetX, elementBox.y + elementBox.height / 2, {
    steps: 12,
  });

  const guideCount = await page.locator('span.bg-fuchsia-500').count();
  if (guideCount === 0) {
    throw new Error('no alignment guide appeared near the page centre');
  }

  await page.mouse.up();

  // Guides are transient: they must disappear once the drag ends.
  if ((await page.locator('span.bg-fuchsia-500').count()) !== 0) {
    throw new Error('alignment guide stayed visible after the drag ended');
  }

  const finalBox = await element.boundingBox();
  const offset = Math.abs(
    finalBox.x + finalBox.width / 2 - (stageBox.x + stageBox.width / 2),
  );
  if (offset > 1.5) {
    throw new Error(`element did not snap to centre, off by ${offset.toFixed(1)}px`);
  }
});

await check('pasting an image from the clipboard inserts it', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.getByAltText('Page 1').first().waitFor({ timeout: 60000 });

  // Synthesise a clipboard paste carrying a PNG, as a screenshot would.
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(0, 0, 120, 60);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const data = new DataTransfer();
    data.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));

    window.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true }),
    );
  });

  await page.getByRole('group', { name: 'Image' }).first().waitFor({ timeout: 20000 });

  const bytes = await runAndDownload('Apply changes');
  assertPdf(bytes);

  if (!bytes.includes(Buffer.from('/Image'))) {
    throw new Error('pasted image is missing from the output');
  }
});

await check('text recognition finds lines and replaces one', async () => {
  await page.goto(`${BASE}/en/edit`, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', FIXTURE);
  await page.getByAltText('Page 1').first().waitFor({ timeout: 60000 });

  await page.getByRole('button', { name: 'Recognise text' }).click();

  // The fixture writes "Fixture page 1" on page 1 — one recognisable line.
  const line = page.getByRole('button', { name: /Replace the line/ }).first();
  await line.waitFor({ timeout: 60000 });

  const label = await line.getAttribute('aria-label');
  if (!/Fixture page 1/.test(label)) {
    throw new Error(`unexpected recognised text: ${label}`);
  }

  await line.click();

  // The line becomes a text box pre-filled with the original wording.
  const textarea = page.locator('[role="group"] textarea');
  await textarea.waitFor({ timeout: 20000 });
  const value = await textarea.inputValue();
  if (!/Fixture page 1/.test(value)) {
    throw new Error(`text box not pre-filled, got "${value}"`);
  }

  await textarea.fill('Replaced heading');
  await page.keyboard.press('Escape');
  const bytes = await runAndDownload('Apply changes');
  assertPdf(bytes);
  if (countPages(bytes) !== 5) throw new Error('page count changed');
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
