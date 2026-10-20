import { mkdirSync, writeFileSync } from 'node:fs';

import { PDFDocument } from 'pdf-lib';
/** Actual-size prototype evidence, using the same browser render as the review. No database writes. */
import { chromium } from 'playwright';
const root = new URL('./', import.meta.url).pathname;
mkdirSync(root + 'output/pdf', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const combined = await PDFDocument.create();
const manifest: any[] = [];
let renderErrors: string[] = [];
page.on('pageerror', (error) => renderErrors.push(String(error)));
async function capture(name: string, query: string, extraCSS = '') {
  renderErrors = [];
  await page.goto('http://127.0.0.1:39612/?' + query, { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(250);
  await page.addStyleTag({
    content: `@page{size:A4;margin:12mm}body{margin:0;background:white;color:#182735} .review-heading,.prototype-note,.variant-switcher,.faction-case-nav{display:none!important} main{padding:0!important} details{display:none!important} .gf9-art-review section{break-before:page;padding:0;margin:0;border:0;background:white;break-inside:avoid}.gf9-header-review-grid{display:block}.gf9-header-review-example{break-inside:avoid;margin-bottom:10mm}.gf9-header-comparison{gap:8mm}.gf9-label-token-grid article{break-inside:avoid}.gf9-label-cards figure{break-inside:avoid;margin-bottom:8mm} ${extraCSS}`,
  });
  if (renderErrors.length) throw new Error(name + ': ' + renderErrors.join('; '));
  const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true });
  const doc = await PDFDocument.load(bytes);
  const pages = await combined.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => combined.addPage(p));
  manifest.push({ name, query, pages: doc.getPageCount(), widthMm: 210, heightMm: 297 });
}
await capture('artwork-source-and-selected-treatments', 'case=art&variant=A');
await capture('selected-header-A', 'case=headers&variant=A');
await capture('existing-card-and-token-labels', 'case=labels');
await page.setViewportSize({ width: 794, height: 1123 });
for (const [faction, sheetPage] of [
  ['bene-gesserit', '2'],
  ['ecaz', '1'],
  ['reversible-example', '2'],
]) {
  await capture(
    'sheet-' + faction,
    `frame=sheet&faction=${faction}&variant=proposed&sheetPage=${sheetPage}`,
    '@page{size:A4;margin:0} .gf9-faction-frame{margin:0!important}'
  );
}
combined.getPages().forEach((p) => p.setMediaBox(0, 0, (210 * 72) / 25.4, (297 * 72) / 25.4));
const file = root + 'output/pdf/gf9-component-treatment-proof.pdf';
writeFileSync(file, await combined.save());
writeFileSync(root + 'output/pdf/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ file, totalPages: combined.getPageCount(), sections: manifest }));
await browser.close();
