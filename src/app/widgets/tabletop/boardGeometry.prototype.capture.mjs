import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from 'playwright';
const proof = resolve(process.argv[2] ?? 'docs/prototypes/board-table-geometry/proof');
await mkdir(proof, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
const errors = [],
  missing = [],
  warnings = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'warning') {
    warnings.push(m.text());
  }
});
page.on('response', (r) => {
  if (r.status() >= 400) {
    missing.push({ status: r.status(), url: r.url() });
  }
});
await page.goto(
  'http://localhost:6113/iframe.html?id=widgets-tabletop-boardgeometry-prototype--inspect&viewMode=story'
);
await page.waitForFunction(() => !!window.boardGeometrySpike, { timeout: 90_000 });
await page.locator('canvas').waitFor();
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
await page.getByRole('combobox', { name: 'Table conversion', exact: true }).click();
await page.getByRole('option', { name: 'Territory triangles', exact: true }).click();
const samples = [];
for (let n = 0; n < 5; n++) {
  samples.push(await page.evaluate(() => window.boardGeometrySpike.inspectAll()));
}
await writeFile(proof + '/samples.json', JSON.stringify(samples, null, 2));
await page.mouse.move(1000, 560);
await page.waitForTimeout(300);
console.log('hover', await page.getByTestId('picked-territory').innerText());
await page.screenshot({ path: proof + '/arrakis-triangles.png', fullPage: true });
await page.getByRole('combobox', { name: 'Table conversion', exact: true }).click();
await page.getByRole('option', { name: 'Existing SVG converter', exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: proof + '/arrakis-svg-bridge.png', fullPage: true });
await page.getByRole('combobox', { name: 'Saved board', exact: true }).click();
await page.getByRole('option', { name: 'Curves and island', exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: proof + '/island-svg-bridge.png', fullPage: true });
await page.getByRole('combobox', { name: 'Table conversion', exact: true }).click();
await page.getByRole('option', { name: 'Territory triangles', exact: true }).click();
await page.waitForTimeout(400);
await page.mouse.move(1060, 650);
await page.waitForTimeout(200);
console.log('hover custom', await page.getByTestId('picked-territory').innerText());
await page.screenshot({ path: proof + '/island-triangles.png', fullPage: true });
await page.getByRole('combobox', { name: 'Table conversion', exact: true }).click();
await page.getByRole('option', { name: 'Browser artwork texture', exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: proof + '/island-textured.png', fullPage: true });
await page.getByRole('combobox', { name: 'Saved board', exact: true }).click();
await page.getByRole('option', { name: 'Arrakis', exact: true }).click();
await page.waitForTimeout(500);
await page.mouse.move(1000, 560);
await page.waitForTimeout(100);
await page.screenshot({ path: proof + '/arrakis-textured.png', fullPage: true });
await writeFile(
  proof + '/browser.json',
  JSON.stringify(
    {
      browser: browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      errors,
      missing,
      warnings: [...new Set(warnings)],
    },
    null,
    2
  )
);
console.log(
  JSON.stringify({
    errors,
    missing: [...new Set(missing.map((r) => r.url))].slice(0, 12),
    warnings: [...new Set(warnings)].slice(0, 6),
  })
);
await browser.close();
