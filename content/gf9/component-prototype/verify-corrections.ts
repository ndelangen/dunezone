import { writeFileSync } from 'node:fs';

import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors: string[] = [];
const failed: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => {
  if (r.status() >= 400) failed.push(r.url());
});
const report: any = {};
for (const [key, query] of [
  ['labels', 'case=labels'],
  ['headers', 'case=headers&variant=A'],
]) {
  await page.goto('http://127.0.0.1:39612/?' + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const titles = [...document.querySelectorAll('[data-card-title-ready]')];
    return titles.length > 0 && titles.every((t) => t.getAttribute('data-card-title-ready') === 'true');
  });
  report[key] = await page.locator('[data-card-title-ready]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const text = node.querySelector('span')!;
      const box = node.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(text);
      const lineRects = [...range.getClientRects()];
      return {
        text: text.textContent,
        fontSize: getComputedStyle(node).fontSize,
        oneLine: lineRects.length <= 1,
        fits: lineRects.every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5),
        prefixed: /^GF9\s/.test(text.textContent ?? ''),
      };
    })
  );
  if (key === 'labels') {
    await page
      .locator('.gf9-label-cards')
      .screenshot({ path: new URL('./output/corrected-card-titles.png', import.meta.url).pathname });
    await page
      .locator('.gf9-native-token-samples')
      .screenshot({ path: new URL('./output/native-token-comparison.png', import.meta.url).pathname });
    report.missingImages = await page
      .locator('img')
      .evaluateAll((nodes) => {
        const images = nodes as HTMLImageElement[];
        return images.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src);
      });
  }
}
const map = await page.request.get('http://127.0.0.1:39612/vector/background/map.svg');
report.mapNormalized = /viewBox="0 0 100 100"/.test(await map.text());
report.errors = errors;
report.failed = failed;
writeFileSync(
  new URL('./output/correction-verification.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify(report));
await browser.close();
