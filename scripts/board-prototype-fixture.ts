import { readFileSync, writeFileSync } from 'node:fs';

import { DOMParser } from 'linkedom';
import { chromium } from 'playwright';
import svgpath from 'svgpath';

/* This extraction is a throwaway recreation fixture, not an approved SVG import workflow. */
const svg = new DOMParser().parseFromString(readFileSync('media/vector/background/map.svg', 'utf8'), 'image/svg+xml');
const nodes: Record<string, [number, number]> = {};
const edges: object[] = [];
const shapes: object[] = [];
const edgeKeys = new Set<string>();
let greatestAdjustment = 0;
function node(x: number, y: number) {
  for (const [key, p] of Object.entries(nodes)) {
    const distance = Math.hypot(p[0] - x, p[1] - y);
    if (distance < 0.025) {
      greatestAdjustment = Math.max(greatestAdjustment, distance);
      return key;
    }
  }
  const key = `n${Object.keys(nodes).length}`;
  nodes[key] = [x, y];
  return key;
}
for (const type of ['strongholds', 'polar', 'rock', 'sand']) {
  const group = svg.getElementById(type)!;
  const bases = [...group.querySelectorAll('path')].filter(
    (p) => p.getAttribute('fill') !== 'none' && p.hasAttribute('stroke')
  );
  for (const base of bases) {
    const name =
      base.id || (base.parentElement!.id && base.parentElement!.id !== type ? base.parentElement!.id : 'polar-sink');
    const path = svgpath(base.getAttribute('d')!)
      .transform(base.getAttribute('transform') || '')
      .abs()
      .unshort();
    let x = 0,
      y = 0,
      sx = 0,
      sy = 0;
    const shapeEdges: string[] = [];
    path.iterate((segment) => {
      const [kind, ...values] = segment;
      if (kind === 'M') {
        x = values[0]!;
        y = values[1]!;
        sx = x;
        sy = y;
        return;
      }
      let nx = x,
        ny = y;
      if (kind === 'H') {
        nx = values[0]!;
      } else if (kind === 'V') {
        ny = values[0]!;
      } else if (kind === 'Z') {
        nx = sx;
        ny = sy;
      } else {
        [nx, ny] = values.slice(-2);
      }
      const a = node(x, y),
        b = node(nx, ny);
      if (a !== b) {
        const signature = [a, b].sort().join(':') + (kind === 'A' ? `:${values.slice(0, 3).join(',')}` : '');
        const id = signature;
        shapeEdges.push(id);
        if (!edgeKeys.has(signature)) {
          edgeKeys.add(signature);
          edges.push({
            id,
            a,
            b,
            kind: kind === 'A' ? 'arc' : kind === 'C' ? 'cubic' : 'line',
            ...(kind === 'A' ? { arc: values.slice(0, 5) } : {}),
            ...(kind === 'C' ? { c1: values.slice(0, 2), c2: values.slice(2, 4) } : {}),
          });
        }
      }
      x = nx;
      y = ny;
    });
    shapes.push({
      name,
      type: type === 'strongholds' ? 'stronghold' : type,
      edges: shapeEdges,
      insetLine: base.parentElement?.querySelector('[stroke-dasharray]')
        ? 'dashed'
        : type === 'sand'
          ? 'none'
          : 'solid',
    });
  }
}
const sectors = svg.getElementById('sectors')!.outerHTML;
const sectorLines = [...svg.getElementById('sectors')!.querySelectorAll('path')].map((element) => {
  const points: [number, number][] = [];
  svgpath(element.getAttribute('d')!)
    .transform(element.parentElement!.getAttribute('transform') || '')
    .abs()
    .iterate(([kind, ...values]) => {
      const previous = points.at(-1);
      points.push(
        kind === 'H' ? [values[0]!, previous![1]] : kind === 'V' ? [previous![0], values[0]!] : [values[0]!, values[1]!]
      );
    });
  return points;
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(readFileSync('media/vector/background/map.svg', 'utf8'));
const symbols = await page.evaluate(() =>
  [...document.querySelectorAll('#icons path')]
    .filter((_, i) => i % 2 === 0)
    .map((element, i) => {
      const p = element as SVGGraphicsElement,
        b = p.getBBox();
      return {
        id: `arrakis-decal-${i}`,
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
        scale: Math.max(b.width, b.height),
      };
    })
);
await browser.close();
writeFileSync(
  'src/app/routes/_app/assets/board-prototype/arrakis.fixture.json',
  JSON.stringify({ nodes, edges, shapes, symbols, sectors, sectorLines, greatestAdjustment }, null, 2) + '\n'
);
console.log({ nodes: Object.keys(nodes).length, edges: edges.length, territories: shapes.length, greatestAdjustment });
