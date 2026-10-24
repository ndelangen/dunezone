import preview from '@sb/preview';
import { standardStormCard } from '@shared/assets/standardStormDeck';
import { resolveAsset } from '@shared/media/resolveAsset';
import { expect, within } from 'storybook/test';

import { StormCard } from './Storm';

const meta = preview.meta({
  component: StormCard,
  globals: { viewport: { value: 'card' } },
  args: standardStormCard(1),
});

/* Saved backgrounds from the former editor cannot change the fixed Storm head or symbol. */
export const FixedIdentity = meta.story({
  args: {
    iconScale: 3,
    iconOffset: [42, 39],
    iconInvert: true,
    iconOpacity: 0.2,
    head: { ...standardStormCard(1).head, colors: ['#ff0000', '#00ff00'], image: '/image/texture/001.jpg' },
    icon: [
      { ...standardStormCard(1).icon[0], colors: ['#0000ff', '#ff00ff'], image: '/image/texture/001.jpg' },
      '/vector/icon/storm_disc.svg',
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = canvas.getByText('1 Sector', { exact: true }).parentElement!;
    const type = canvas.getByText('Storm', { exact: true });
    await expect(getComputedStyle(title).fontSize).toBe('60px');
    await expect(getComputedStyle(type).fontSize).toBe('40px');
    const symbols = Array.from(canvasElement.querySelectorAll('img')).filter(
      (image) => image.src.endsWith('/vector/icon/storrm_standalone.svg') && image.style.width
    );
    await expect(symbols).toHaveLength(2);
    await Promise.all(
      symbols.flatMap((symbol) => {
        const style = getComputedStyle(symbol);
        return [
          expect(style.width).toBe('85px'),
          expect(style.marginLeft).toBe('0px'),
          expect(style.marginTop).toBe('0px'),
          expect(style.filter).toBe('none'),
        ];
      })
    );
    const textures = Array.from(canvasElement.querySelectorAll('pattern image'));
    await expect(textures).toHaveLength(2);
    await Promise.all(
      textures.map((texture) =>
        expect(texture.getAttribute('href') ?? texture.getAttribute('xlink:href')).toBe(
          resolveAsset('/image/texture/082.jpg', 'large')
        )
      )
    );
    const fills = Array.from(canvasElement.querySelectorAll('rect')).map((rect) => rect.getAttribute('fill'));
    await expect(fills).toContain('#7A3A07');
    await expect(fills).toContain('#E9C55B');
    await expect(canvasElement.querySelector('img[src="/vector/icon/storm_disc.svg"]')).toBeNull();
  },
});
