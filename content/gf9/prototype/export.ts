/** Export the three reviewed sample packs from the same browser render, without database writes. */
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
const focused = process.argv.includes('--focused');
const output = path.join(root, 'output/pdf');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
const manifest = [];
async function normalisePageBoxes(file: string, sizes: { widthMm: number; heightMm: number }[]) {
  const document = await PDFDocument.load(await Bun.file(file).arrayBuffer(), { updateMetadata: false });
  if (document.getPageCount() !== sizes.length) throw new Error(`Unexpected PDF pagination: ${file}`);
  const rawPageSizes = document.getPages().map(page => page.getSize());
  document.getPages().forEach((page, index) => {
    const size = sizes[index];
    // Match the existing publisher's exact MediaBox step in workers/publisher/rulebook-pdf.ts.
    // Chromium rounds paper dimensions. Keep its content unchanged and set the declared paper edge.
    page.setMediaBox(0, 0, size.widthMm * 72 / 25.4, size.heightMm * 72 / 25.4);
  });
  writeFileSync(file, await document.save());
  return rawPageSizes;
}
for (const variant of focused ? ['C'] : ['A', 'B', 'C']) {
  await page.goto(`http://127.0.0.1:39611/?variant=${variant}&print=1${focused ? '&review=revision-2' : ''}`);
  await page.emulateMedia({ media: 'print' });
  await page.waitForSelector('html[data-prototype-ready="ready"]', { timeout: 90_000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(500);
  const file = path.join(output, focused ? 'gf9-c-focused-revision.pdf' : `gf9-composition-${variant.toLowerCase()}-prototype.pdf`);
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  const formats = await page.locator('.proof-paper').evaluateAll(papers => papers.map(paper => (paper as HTMLElement).dataset.format));
  const rawPageSizes = await normalisePageBoxes(file, formats.map(format => ({ widthMm: format === 'core-square' ? 254 : 132.08, heightMm: 254 })));
  manifest.push({ variant, file, sampleLeaves: formats.length, rawPageSizes });
}
if (!focused) {
await page.goto('http://127.0.0.1:39611/?variant=A&print=comparison');
await page.waitForSelector('html[data-prototype-ready="ready"]', { timeout: 90_000 });
const comparisonFile = path.join(output, 'gf9-original-current-proposed-comparison.pdf');
await page.pdf({ path: comparisonFile, preferCSSPageSize: true, printBackground: true, tagged: true });
const comparisonCount = await page.locator('.comparison-spread').count();
const rawPageSizes = await normalisePageBoxes(comparisonFile, Array.from({ length: comparisonCount }, () => ({ widthMm: 760, heightMm: 335 })));
manifest.push({ variant: 'A-comparison', file: comparisonFile, sampleLeaves: comparisonCount, rawPageSizes });
}
writeFileSync(path.join(output, focused ? 'focused-manifest.json' : 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify(manifest));
