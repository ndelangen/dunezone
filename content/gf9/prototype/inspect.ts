/** Browser evidence for this throwaway prototype, not an application test suite. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
const focused = process.argv.includes('--focused');
const output = path.join(root, focused ? 'output/focused' : 'output');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const records = [];
for (const variant of focused ? ['C'] : ['A', 'B', 'C']) {
  await page.goto(`http://127.0.0.1:39611/?variant=${variant}&print=1${focused ? '&review=revision-2' : ''}`);
  await page.waitForSelector('html[data-prototype-ready="ready"]', { timeout: 90_000 });
  await page.waitForTimeout(500);
  const diagnostics = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.proof-paper')].map(paper => {
    const bounds = paper.getBoundingClientRect();
    const regions = [...paper.querySelectorAll<HTMLElement>('[data-rulebook-region]')].map(region => {
      const box = region.getBoundingClientRect();
      return { key: region.dataset.rulebookRegion, height: Math.round(box.height), scrollHeight: region.scrollHeight, clientHeight: region.clientHeight, bottom: Math.round(box.bottom - bounds.top), overflow: region.scrollHeight - region.clientHeight };
    });
    return { caseId: paper.dataset.case, width: bounds.width, height: bounds.height, text: paper.innerText, regions, brokenImages: [...paper.querySelectorAll('img')].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src) };
  }));
  for (const paper of await page.locator('.proof-paper').all()) {
    const id = await paper.getAttribute('data-case');
    await paper.screenshot({ path: path.join(output, `${variant}-${id}.png`) });
  }
  records.push({ variant, diagnostics });
}
await page.goto(focused ? 'http://127.0.0.1:39611/?variant=C&review=revision-2&case=core-shipment&zoom=35' : 'http://127.0.0.1:39611/?variant=A&case=core-setup&zoom=35');
await page.waitForSelector('html[data-prototype-ready="ready"]');
await page.screenshot({ path: path.join(output, 'comparison-browser.png'), fullPage: true });
writeFileSync(path.join(output, 'browser-review.json'), JSON.stringify({ records, errors }, null, 2) + '\n');
console.log(JSON.stringify({ errors, pages: records.flatMap(record => record.diagnostics.map(d => ({ variant: record.variant, caseId: d.caseId, broken: d.brokenImages.length, overflows: d.regions.filter(r => r.overflow > 2) }))) }, null, 2));
await browser.close();
