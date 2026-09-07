import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument } from 'pdf-lib';
/** Capture the experiment's measurements and three classic specimen PDFs. */
import { chromium } from 'playwright';

const entry = process.argv[2];
if (!entry) {
  throw new Error('Pass the running prototype URL');
}
const output = join(dirname(fileURLToPath(import.meta.url)), 'output');
await mkdir(join(output, 'pdf'), { recursive: true });
await mkdir(join(output, 'images'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400) {
    errors.push(`${response.status()} ${response.url()}`);
  }
});
const results = [];
for (const variant of ['A', 'B', 'C']) {
  for (const format of ['square', 'a4', 'tall']) {
    for (const specimen of ['fremen', 'locations', 'karama', 'faq']) {
      await page.goto(`${entry}?variant=${variant}&format=${format}&specimen=${specimen}`);
      await page.waitForFunction(() => window.__prototypeReady);
      await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
      const result = await page.evaluate(() => {
        const { placements: _placements, ...summary } = window.__prototype;
        const sizes = [...document.querySelectorAll('.content-unit p, .item-cell dd, .reference-native td')].map(
          (item) => Number.parseFloat(getComputedStyle(item).fontSize)
        );
        return { ...summary, minBodyPx: Math.min(...sizes), maxBodyPx: Math.max(...sizes) };
      });
      results.push(result);
      if (format === 'a4' && (specimen === 'fremen' || specimen === 'locations' || specimen === 'karama')) {
        await page.addStyleTag({ content: '.review-chrome { visibility: hidden !important; }' });
        await page
          .locator('.prototype-page')
          .first()
          .screenshot({ path: join(output, 'images', `${variant}-${format}-${specimen}.png`) });
      }
    }
  }
}
const pdfs = [];
for (const format of ['square', 'a4', 'tall']) {
  await page.goto(`${entry}?variant=A&format=${format}&specimen=all`);
  await page.waitForFunction(() => window.__prototypeReady);
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  const state = await page.evaluate(() => window.__prototype);
  const path = join(output, 'pdf', `rulebook-spike-classic-${format}.pdf`);
  const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true });
  const document = await PDFDocument.load(bytes);
  /** Chromium rounds CSS paper dimensions; set exact page boxes without rescaling the type. */
  for (const sheet of document.getPages()) {
    sheet.setSize((state.dimensionsMm[0] * 72) / 25.4, (state.dimensionsMm[1] * 72) / 25.4);
  }
  await writeFile(path, await document.save());
  pdfs.push({ format, path, pageCount: state.pageCount, contentCount: state.contentCount });
}
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${entry}?variant=A&format=tall&specimen=locations`);
await page.waitForFunction(() => window.__prototypeReady);
const mobile = await page.evaluate(() => ({
  horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
}));
await page.locator('#next').click();
const nextWorked = await page.evaluate(() => window.__prototype.variant === 'B');
await page.keyboard.press('ArrowLeft');
const keyboardWorked = await page.evaluate(() => window.__prototype.variant === 'A');
await page.screenshot({ path: join(output, 'images', 'mobile-review.png') });
await writeFile(
  join(output, 'measurements.json'),
  JSON.stringify({ results, pdfs, errors, mobile, nextWorked, keyboardWorked }, null, 2)
);
console.log(JSON.stringify({ results, pdfs, errors, mobile, nextWorked, keyboardWorked }, null, 2));
await browser.close();
