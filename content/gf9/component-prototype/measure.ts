import { writeFileSync } from 'node:fs';

import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.goto('http://127.0.0.1:39612/?case=labels', { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  await document.fonts.ready;
});
const bodies = await page.locator('.gf9-label-native-card').evaluateAll((cards) =>
  cards.map((card) => {
    const body = [...card.querySelectorAll('div')].find((el) => getComputedStyle(el).height === '499px');
    if (!body) return null;
    const range = document.createRange();
    range.selectNodeContents(body);
    const box = body.getBoundingClientRect();
    const text = range.getBoundingClientRect();
    return {
      title: card.closest('figure')?.querySelector('figcaption')?.textContent,
      characters: body.textContent?.length,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      textBottom: text.bottom,
      bodyBottom: box.bottom,
      clipped: text.bottom > box.bottom + 0.5,
    };
  })
);
await page.goto('http://127.0.0.1:39612/?case=headers&variant=A', { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  await document.fonts.ready;
});
await page.waitForSelector('[data-measured="true"]');
const names = await page.locator('[data-header-name]').evaluateAll((elements) =>
  elements.map((el) => {
    const card = el.closest('[data-fixture-id]')!;
    const rect = el.getBoundingClientRect();
    const text = el.querySelector('[data-header-line]')!.getBoundingClientRect();
    return {
      id: card.getAttribute('data-fixture-id'),
      fontSize: el.getAttribute('data-header-font-size'),
      text: el.textContent,
      inkWithinReservedWidth: text.right <= rect.right + 0.5,
    };
  })
);
const report = { bodies, names };
writeFileSync(new URL('./output/measurements.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
await browser.close();
