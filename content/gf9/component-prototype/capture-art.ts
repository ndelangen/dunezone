import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.goto('http://127.0.0.1:39612/?case=art&variant=A', { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  await document.fonts.ready;
});
await page
  .locator('.gf9-art-head')
  .first()
  .screenshot({ path: new URL('./output/malina-horizontal-split.png', import.meta.url).pathname });
await page
  .locator('.gf9-art-head')
  .nth(1)
  .screenshot({ path: new URL('./output/ilban-horizontal-split.png', import.meta.url).pathname });
await page.screenshot({ path: new URL('./output/art-horizontal-split.png', import.meta.url).pathname, fullPage: true });
await browser.close();
