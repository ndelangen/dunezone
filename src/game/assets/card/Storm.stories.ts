import preview from '@sb/preview';
import { standardStormCard } from '@shared/assets/standardStormDeck';
import { resolveAsset } from '@shared/media/resolveAsset';
import { expect } from 'storybook/test';

import { StormCard } from './Storm';

const meta = preview.meta({
  component: StormCard,
  globals: { viewport: { value: 'card' } },
  args: standardStormCard(1),
});
export const One = meta.story({});
export const Two = meta.story({ args: standardStormCard(2) });
export const Three = meta.story({ args: standardStormCard(3) });
export const Four = meta.story({ args: standardStormCard(4) });
export const Five = meta.story({ args: standardStormCard(5) });
export const Six = meta.story({ args: standardStormCard(6) });

/* Saved backgrounds from the former editor cannot change the fixed Storm head or symbol. */
export const FixedIdentity = meta.story({
  args: {
    head: { ...standardStormCard(1).head, colors: ['#ff0000', '#00ff00'], image: '/image/texture/001.jpg' },
    icon: [
      { ...standardStormCard(1).icon[0], colors: ['#0000ff', '#ff00ff'], image: '/image/texture/001.jpg' },
      '/vector/icon/storm_disc.svg',
    ],
  },
  play: async ({ canvasElement }) => {
    const textures = Array.from(canvasElement.querySelectorAll('pattern image'));
    await expect(textures).toHaveLength(2);
    for (const texture of textures) {
      await expect(texture.getAttribute('href') ?? texture.getAttribute('xlink:href')).toBe(
        resolveAsset('/image/texture/082.jpg', 'large')
      );
    }
    const fills = Array.from(canvasElement.querySelectorAll('rect')).map((rect) => rect.getAttribute('fill'));
    await expect(fills).toContain('#7A3A07');
    await expect(fills).toContain('#E9C55B');
    await expect(canvasElement.querySelector('img[src="/vector/icon/storm_disc.svg"]')).toBeNull();
  },
});
