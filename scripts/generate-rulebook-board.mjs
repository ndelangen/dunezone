import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
const cwd = fileURLToPath(new URL('..', import.meta.url));
/** Regenerate the board envelope from its maintained SVG after changing map geometry. */
const svg = await readFile(`${cwd}/public/page/map.svg`, 'utf8');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ javaScriptEnabled: false, serviceWorkers: 'block' });
await page.route('**/*', (route) => route.abort());
await page.setContent(`<style>body{margin:0}svg{display:block}</style>${svg}`);
const geometry = await page.evaluate(() => {
  const root = document.querySelector('svg');
  const bounds = root.getBoundingClientRect();
  const parts = [...root.querySelectorAll('[id]')]
    .filter((el) => !['root', 'rootz', 'icons'].includes(el.id))
    .map((el) => {
      const b = el.getBoundingClientRect();
      const left = Math.max(bounds.left, b.left),
        top = Math.max(bounds.top, b.top);
      const right = Math.min(bounds.right, b.right),
        bottom = Math.min(bounds.bottom, b.bottom);
      const paths = [...(el.matches('path') ? [el] : []), ...el.querySelectorAll('path')].map((path) => {
        const m = root.getScreenCTM().inverse().multiply(path.getScreenCTM());
        return {
          d: path.getAttribute('d'),
          transform: [
            m.a / root.viewBox.baseVal.width,
            m.b / root.viewBox.baseVal.height,
            m.c / root.viewBox.baseVal.width,
            m.d / root.viewBox.baseVal.height,
            m.e / root.viewBox.baseVal.width,
            m.f / root.viewBox.baseVal.height,
          ],
        };
      });
      return {
        key: el.id,
        x: (left - bounds.left) / bounds.width,
        y: (top - bounds.top) / bounds.height,
        width: (right - left) / bounds.width,
        height: (bottom - top) / bounds.height,
        highlight: { paths },
      };
    })
    .filter((p) => p.width > 0 && p.height > 0 && p.highlight.paths.length);
  return { width: root.viewBox.baseVal.width, height: root.viewBox.baseVal.height, parts };
});
await browser.close();
const names = {
  tueks: "Tuek's Sietch",
  tabr: 'Sietch Tabr',
  habbanya: 'Habbanya Sietch',
  polar: 'Polar Sink',
  rock: 'Rock territories',
  sand: 'Sand territories',
  strongholds: 'Strongholds',
  sectors: 'Sectors',
};
geometry.parts = geometry.parts.map((part) => ({
  key: part.key,
  label:
    names[part.key] ??
    part.key
      .split('-')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' '),
  x: part.x,
  y: part.y,
  width: part.width,
  height: part.height,
  highlight: part.highlight,
}));
const revision = createHash('sha256').update(JSON.stringify({ svg, geometry })).digest('hex');
const imageUrl = `/page/arrakis-${revision}.svg`;
await writeFile(`${cwd}/public${imageUrl}`, svg);
await mkdir(`${cwd}/src/shared/rulebooks/boards`, { recursive: true });
await writeFile(
  `${cwd}/src/shared/rulebooks/boards/arrakis.json`,
  JSON.stringify({ id: 'arrakis', name: 'Arrakis board', revision, imageUrl, geometry }, null, 2) + '\n'
);
await writeFile(
  `${cwd}/src/shared/rulebooks/boards/arrakis.illustration.json`,
  JSON.stringify({ id: 'arrakis', revision, svg }, null, 2) + '\n'
);
console.log(
  JSON.stringify({ revision, imageUrl, parts: geometry.parts.length, bytes: JSON.stringify({ svg, geometry }).length })
);
