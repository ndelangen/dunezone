import { chromium } from 'playwright';
/* PROTOTYPE (#1145): shoots every real token face from /play/demo?variant=tokens into ./tokens. Run from the repo root with the dev server on :3000: node src/app/routes/_app/play/drafting-prototype/capture-tokens.mjs */
const out = process.env.OUT ?? new URL('./tokens', import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:3000/play/demo?variant=tokens', { waitUntil: 'networkidle' });
await page.waitForSelector('.dp-gallery__cell');
await page.addStyleTag({ content: '.dp-switcher{display:none !important}' });
await page.waitForTimeout(2500);
const cells = page.locator('.dp-gallery__cell');
const count = await cells.count();
for (let i = 0; i < count; i += 1) {
  const cell = cells.nth(i);
  const slug = await cell.getAttribute('data-slug');
  await cell.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  const box = await cell.boundingBox();
  if (!box || box.y < 90 || box.y + box.height > 1400) {
    throw new Error(`${slug} not clear of the header: y=${box?.y}`);
  }
  await cell.screenshot({ path: `${out}/${slug}.png` });
}
await browser.close();
console.log(`captured ${count}`);
