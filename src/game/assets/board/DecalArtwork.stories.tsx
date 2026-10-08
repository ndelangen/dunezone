import preview from '@sb/preview';
import type { Decal } from '@shared/boards/schema';
import { expect } from 'storybook/test';

import { BOARD_ARTWORK } from './artwork';
import { DecalArtwork } from './Board';

const decal: Decal = {
  id: 'city',
  artwork: '/vector/icon/arrakis-city.svg',
  x: 0,
  y: 0,
  scale: 24,
  rotation: 0,
  outline: true,
};
const preset = BOARD_ARTWORK['/vector/icon/arrakis-city.svg'];
const meta = preview.meta({
  component: DecalArtwork,
  render: (args) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -32 64 64" width="256" height="256">
      <DecalArtwork {...args} />
    </svg>
  ),
  play: async ({ canvasElement, args }) => {
    const svg = canvasElement.querySelector('svg')!.cloneNode(true) as SVGSVGElement;
    const linkedArtwork = svg.querySelector('image');
    if (linkedArtwork) {
      linkedArtwork.setAttribute(
        'href',
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BOARD_ARTWORK[args.decal.artwork])}`
      );
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
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const offset = (y * 512 + x) * 4;
        if (pixels[offset + 3] < 200) {
          continue;
        }
        if (pixels[offset] < 100) {
          inkTop = Math.min(inkTop, y);
        }
        if (pixels[offset] > 240 && pixels[offset + 1] > 240 && pixels[offset + 2] > 240) {
          outlineTop = Math.min(outlineTop, y);
        }
      }
    }
    expect(inkTop).toBeLessThan(512);
    if (args.decal.outline) {
      expect(inkTop - outlineTop).toBeGreaterThanOrEqual(3);
      expect(inkTop - outlineTop).toBeLessThanOrEqual(5);
    } else {
      expect(outlineTop).toBe(512);
    }
  },
});

export const PresetOutline = meta.story({ args: { decal, svg: preset } });
export const VectorOutline = meta.story({ args: { decal, svg: BOARD_ARTWORK['/vector/icon/ornithopter.svg'] } });
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
