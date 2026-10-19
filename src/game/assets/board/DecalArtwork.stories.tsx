import preview from '@sb/preview';
import type { Decal } from '@shared/boards/schema';
import { expect } from 'storybook/test';

import palace from '../../../../media/vector/decal/palace.svg?raw';
import { BOARD_ARTWORK } from './artwork';
import { DecalArtwork } from './Board';

const decal: Decal = {
  id: 'city',
  artwork: '/vector/icon/city.svg',
  x: 0,
  y: 0,
  scale: 24,
  rotation: 0,
  outline: true,
};
const preset = BOARD_ARTWORK['/vector/icon/city.svg'];
const meta = preview.meta({
  component: DecalArtwork,
  render: (args) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -32 64 64" width="256" height="256">
      <DecalArtwork {...args} />
    </svg>
  ),
  play: async ({ canvasElement, args }) => {
    const svg = canvasElement.querySelector('svg')!.cloneNode(true) as SVGSVGElement;
    /* A standalone SVG image cannot fetch external fragments. Embed the same vector for the pixel check. */
    const linkedVector = svg.querySelector('use, image');
    if (linkedVector) {
      const source = await fetch(args.decal.artwork).then((response) => response.text());
      if (linkedVector.localName === 'image') {
        linkedVector.setAttribute('href', `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`);
      } else {
        const root = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
        root.id = 'resolved-artwork';
        const definitions = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        definitions.append(root);
        svg.prepend(definitions);
        linkedVector.setAttribute('href', '#resolved-artwork');
      }
    }
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, 512, 512);
    const pixels = context.getImageData(0, 0, 512, 512).data;
    let inkTop = 512;
    let outlineTop = 512;
    let boardInk = 0;
    let blue = 0;
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const offset = (y * 512 + x) * 4;
        if (pixels[offset + 3] < 200) {
          continue;
        }
        if (pixels[offset] < 100) {
          inkTop = Math.min(inkTop, y);
        }
        if (pixels[offset] === 26 && pixels[offset + 1] === 11 && pixels[offset + 2] === 0) {
          boardInk++;
        }
        if (pixels[offset + 2] > pixels[offset] + 10 && pixels[offset + 2] > pixels[offset + 1]) {
          blue++;
        }
        if (pixels[offset] > 240 && pixels[offset + 1] > 240 && pixels[offset + 2] > 240) {
          outlineTop = Math.min(outlineTop, y);
        }
      }
    }
    await expect(inkTop).toBeLessThan(512);
    if (args.decal.artwork === '/vector/decal/palace.svg') {
      await expect(boardInk).toBeGreaterThan(0);
    }
    if (args.decal.artwork === '/vector/decal/palace-multicolor.svg') {
      await expect(blue).toBeGreaterThan(0);
    }
    if (args.decal.outline) {
      await expect(inkTop - outlineTop).toBeGreaterThanOrEqual(3);
      await expect(inkTop - outlineTop).toBeLessThanOrEqual(5);
    } else {
      await expect(outlineTop).toBe(512);
    }
  },
});

export const PresetOutline = meta.story({ args: { decal, svg: preset } });
export const ImageOutline = meta.story({
  args: {
    svg: '',
    decal: {
      ...decal,
      artwork: '/vector/icon/ornithopter.svg',
    },
  },
});
export const WithoutOutline = meta.story({
  args: { decal: { ...decal, outline: false }, svg: preset },
});

export const PalaceInk = meta.story({
  args: { decal: { ...decal, artwork: '/vector/decal/palace.svg', outline: false } },
});

export const PalaceOutline = meta.story({
  args: { decal: { ...decal, artwork: '/vector/decal/palace.svg' } },
});

export const InlinePalace = meta.story({
  args: { decal: { ...decal, artwork: '/vector/decal/palace.svg', outline: false }, svg: palace },
});

export const MulticolorPalace = meta.story({
  args: { decal: { ...decal, artwork: '/vector/decal/palace-multicolor.svg', outline: false } },
});
