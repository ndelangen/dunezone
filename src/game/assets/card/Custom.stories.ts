import preview from '@sb/preview';
import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';
import {
  publishingCustomCardTokens,
  publishingCustomCardTokenLayers,
} from '@shared/assets/fixtures/publishingCustomCardTokens';
import { publishingTreacheryCard } from '@shared/assets/fixtures/publishingTreacheryCard';
import { standardStormCard } from '@shared/assets/standardStormDeck';
import { treacheryToCustomCard } from '@shared/assets/treacheryToCustomCard';
import { expect } from 'storybook/test';

import { treacheryCardFixtures } from '../../fixtures/treacheryCards';
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
const windowCard = standardStormCard(1);
const windowLayers = windowCard.layers;
export const ShiftedWindow = meta.story({
  args: {
    ...windowCard,
    name: 'Moving window',
    windowOffsetY: 200,
    layers: [
      { ...windowLayers[0]!, offset: [0, 38.5] },
      { ...windowLayers[1]!, content: 'Rules above the decal window.', offset: [-370, -331.5], height: 120 },
      {
        ...windowLayers[1]!,
        layerId: '30000000-3000-4000-8000-300000000003',
        content: 'Rules below the decal window.',
        offset: [-370, 290],
        height: 160,
      },
    ],
  },
});
export const LowestWindow = meta.story({
  args: {
    ...ShiftedWindow.input.args,
    windowOffsetY: 440,
    layers: [
      { ...windowLayers[0]!, offset: [0, 278.5] },
      { ...windowLayers[1]!, content: 'Rules above the decal window.', offset: [-370, -331.5], height: 120 },
      {
        ...windowLayers[1]!,
        layerId: '30000000-3000-4000-8000-300000000003',
        content: 'Rules below the decal window.',
        offset: [-370, 508.5],
        size: 30,
        height: 45,
      },
    ],
  },
});
export const LongTitle = meta.story({ args: { name: 'A very long custom card title that must fit inside the Head' } });

export const TokenLayers = meta.story({
  args: { layers: publishingCustomCardTokenLayers, tokens: publishingCustomCardTokens },
});

export const ConvertedTreachery = meta.story({
  args: treacheryToCustomCard({
    ...publishingTreacheryCard,
    iconScale: 1,
    iconOffset: [0, 0],
    iconInvert: false,
    iconOpacity: 1,
  }),
});

export const ConvertedLayeredTreachery = meta.story({
  args: treacheryToCustomCard({
    ...treacheryCardFixtures.layeredDecals,
    about: '',
    iconScale: 1,
    iconInvert: false,
    iconOpacity: 1,
  }),
});

export const FullWidthTitle = meta.story({
  args: { name: '沙漠'.repeat(20) },
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const title = Array.from(canvasElement.querySelectorAll('span')).find(
      (element) => element.textContent === '沙漠'.repeat(20)
    )!;
    await expect(title.scrollWidth).toBeLessThanOrEqual(title.parentElement!.clientWidth + 1);
  },
});
