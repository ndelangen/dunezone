import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DOMParser } from 'linkedom';
import sharp from 'sharp';

import { arrakisBoard, derive } from '../src/app/routes/_app/assets/board-prototype/geometry';

/* Compare the editor's actual SVG against independent masks from the maintained Arrakis source. */
const [svgFile, output] = process.argv.slice(2);
assert(svgFile && output, 'Usage: bun scripts/board-arrakis-proof.ts <editor SVG> <output directory>');
mkdirSync(output, { recursive: true });
const source = readFileSync('media/vector/background/map.svg', 'utf8');
const generated = readFileSync(svgFile, 'utf8');
const parser = new DOMParser();
const original = parser.parseFromString(source, 'image/svg+xml');
original.getElementById('sectors')!.remove();
const svg = parser.parseFromString(generated, 'image/svg+xml');
const board = arrakisBoard();
const topology = derive(board);
const bases = ['strongholds', 'polar', 'rock', 'sand'].flatMap((type) =>
  [...original.getElementById(type)!.querySelectorAll('path')].filter(
    (p) => p.getAttribute('fill') !== 'none' && p.hasAttribute('stroke')
  )
);
const names = bases.map(
  (base) =>
    base.id ||
    (base.parentElement!.id && !['strongholds', 'polar', 'rock', 'sand'].includes(base.parentElement!.id)
      ? base.parentElement!.id
      : 'polar-sink')
);
assert.equal(topology.faces.length, bases.length);
assert.deepEqual(
  Object.values(board.properties)
    .map((p) => p.name)
    .sort(),
  [...names].sort()
);
assert.equal(topology.unrecoveredSegments, 0);
assert.equal(svg.querySelectorAll('[data-clipped-territory]').length, bases.length);
assert.equal(svg.querySelectorAll('text, #sectors, [data-editor-only]').length, 0);
assert.equal(svg.querySelectorAll('[data-clipped-territory] svg').length, 5);
assert.equal(svg.querySelectorAll('[data-decal-outline]').length, 5);
const sized = (input: string, size: number) => {
  const document = parser.parseFromString(input, 'image/svg+xml');
  document.documentElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  document.documentElement.setAttribute('width', String(size));
  document.documentElement.setAttribute('height', String(size));
  return document.documentElement.outerHTML;
};
const raster = (input: string, size: number) =>
  sharp(Buffer.from(sized(input, size)))
    .ensureAlpha()
    .raw()
    .toBuffer();
const mask = (path: string, transform = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="487.06" height="487.06" viewBox="0 0 487.06 487.06"><path fill="#fff" fill-rule="evenodd" d="${path}" transform="${transform}"/></svg>`;
const comparisons = [];
for (const size of [1948, 3896]) {
  const territories = [];
  for (let i = 0; i < bases.length; i++) {
    const name = names[i],
      base = bases[i];
    const face = topology.faces.find((face) => board.properties[face.key].name === name)!;
    const painted = [...svg.querySelectorAll('[data-clipped-territory]')].find(
      (group) => group.getAttribute('data-clipped-territory') === name
    )!;
    const clipId = painted.getAttribute('clip-path')!.slice(5, -1);
    assert.equal(
      svg.getElementById(clipId)!.querySelector('path')!.getAttribute('d'),
      face.path,
      `Owning crop: ${name}`
    );
    assert.equal(
      painted.parentElement!.querySelector('path')!.getAttribute('d'),
      face.path,
      `Editor/model correspondence: ${name}`
    );
    const a = await raster(mask(base.getAttribute('d')!, base.getAttribute('transform') || ''), size);
    const b = await raster(mask(face.path), size);
    let interiorMismatch = 0,
      coverageDifference = 0;
    for (let pixel = 3; pixel < a.length; pixel += 4) {
      if ((a[pixel] === 255 && b[pixel] === 0) || (b[pixel] === 255 && a[pixel] === 0)) {
        interiorMismatch++;
      }
      coverageDifference += Math.abs(a[pixel] - b[pixel]) / 255;
    }
    assert.equal(interiorMismatch, 0, `Interior mismatch: ${name} at ${size}px`);
    territories.push({ name, rings: face.rings.length, interiorMismatch, coverageDifference });
  }
  const a = await raster(original.documentElement.outerHTML, size),
    b = await raster(generated, size);
  let changedPixels = 0,
    squaredDifference = 0;
  for (let pixel = 0; pixel < a.length; pixel += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const difference = a[pixel + channel] - b[pixel + channel];
      if (difference) {
        changed = true;
      }
      squaredDifference += difference * difference;
    }
    if (changed) {
      changedPixels++;
    }
  }
  comparisons.push({
    size,
    territories,
    changedPixels,
    rootMeanSquareDifference: Math.sqrt(squaredDifference / a.length),
  });
  if (size === 1948) {
    await sharp(Buffer.from(original.documentElement.outerHTML))
      .resize(size, size)
      .png()
      .toFile(join(output, 'arrakis-source.png'));
    await sharp(Buffer.from(sized(generated, size)))
      .resize(size, size)
      .png()
      .toFile(join(output, 'arrakis-recreated.png'));
  }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const boardDraft = JSON.stringify(board, null, 2) + '\n';
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  territories: topology.faces.length,
  unrecoveredSegments: topology.unrecoveredSegments,
  comparisons,
  sourceSha256: hash(source),
  editorSvgSha256: hash(generated),
  boardSha256: hash(boardDraft),
};
writeFileSync(join(output, 'arrakis-board.json'), boardDraft);
writeFileSync(join(output, 'arrakis-comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    territories: report.territories,
    comparisons: comparisons.map(({ size, changedPixels, rootMeanSquareDifference, territories }) => ({
      size,
      changedPixels,
      rootMeanSquareDifference,
      interiorMismatch: territories.reduce((sum, t) => sum + t.interiorMismatch, 0),
      coverageDifference: territories.reduce((sum, t) => sum + t.coverageDifference, 0),
    })),
  })
);
