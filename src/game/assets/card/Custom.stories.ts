import preview from '@sb/preview';
import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';
import {
  publishingCustomCardTokens,
  publishingCustomCardTokenLayers,
} from '@shared/assets/fixtures/publishingCustomCardTokens';
import { expect } from 'storybook/test';

import { CustomCard } from './Custom';

const { about: _about, ...face } = publishingCustomCard;
const meta = preview.meta({
  component: CustomCard,
  globals: { viewport: { value: 'card' } },
  args: face,
});

export const Plain = meta.story({
  play: async ({ canvasElement }) => {
    const frame = Array.from(canvasElement.querySelectorAll<HTMLElement>('div')).find((element) =>
      getComputedStyle(element).backgroundImage.includes('/image/card/base-full-large.webp')
    );
    await expect(frame).toBeDefined();
    const image = new Image();
    image.src = '/image/card/base-full-large.webp';
    await image.decode();
    await expect(image.naturalWidth).toBeGreaterThan(0);
    await expect(frame!.getBoundingClientRect().height).toBe(1263);
  },
});
export const WithDecalWindow = meta.story({ args: { format: 'decal-window' } });
export const LongTitle = meta.story({ args: { name: 'A very long custom card title that must fit inside the Head' } });

export const TokenLayers = meta.story({
  args: { layers: publishingCustomCardTokenLayers, tokens: publishingCustomCardTokens },
});
