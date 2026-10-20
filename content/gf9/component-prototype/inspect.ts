import { mkdirSync, writeFileSync } from 'node:fs';

import { chromium } from 'playwright';
const output = new URL('./output/', import.meta.url).pathname;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const report: any = { pages: [], errors: [], failedRequests: [] };
page.on('pageerror', (error) => report.errors.push(String(error)));
page.on('response', (response) => {
  if (response.status() >= 400) report.failedRequests.push({ url: response.url(), status: response.status() });
});
for (const [name, query] of [
  ['art', 'case=art&variant=A'],
  ['headers-a', 'case=headers&variant=A'],
  ['headers-b', 'case=headers&variant=B'],
  ['headers-c', 'case=headers&variant=C'],
  ['factions-bg', 'case=factions'],
  ['factions-ecaz', 'case=factions&faction=ecaz&sheetPage=1'],
  ['factions-choam', 'case=factions&faction=choam&sheetPage=1'],
  ['labels', 'case=labels'],
]) {
  await page.goto('http://127.0.0.1:39612/?' + query, { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            })
      )
    );
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: output + name + '.png', fullPage: true });
  report.pages.push({
    name,
    missingImages: await page
      .locator('img')
      .evaluateAll((images) =>
        images.filter((img: any) => !img.complete || img.naturalWidth === 0).map((img: any) => img.src)
      ),
    title: await page.title(),
  });
}
writeFileSync(output + 'inspection.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
await browser.close();
