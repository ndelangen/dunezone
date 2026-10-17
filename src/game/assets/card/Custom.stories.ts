import preview from '@sb/preview';
import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';
import {
  publishingCustomCardTokens,
  publishingCustomCardTokenLayers,
} from '@shared/assets/fixtures/publishingCustomCardTokens';
import { publishingTreacheryCard } from '@shared/assets/fixtures/publishingTreacheryCard';
import { standardStormCard } from '@shared/assets/standardStormDeck';
import { treacheryToCustomCard } from '@shared/assets/treacheryToCustomCard';
import { expect, within } from 'storybook/test';

import { treacheryCardFixtures } from '../../fixtures/treacheryCards';
import { CustomCard } from './Custom';

const { about: _about, ...face } = publishingCustomCard;
/* The title's text fits the Head without spilling past it, once the card's fonts have loaded. */
async function expectTitleFits(canvasElement: HTMLElement, name: string) {
  await document.fonts.ready;
  const title = Array.from(canvasElement.querySelectorAll('span')).find((element) => element.textContent === name)!;
  await expect(title.scrollWidth).toBeLessThanOrEqual(title.parentElement!.clientWidth + 1);
}

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
/* The storm card's rules layer, narrowed so a story can restate its text and placement. */
const rulesLayer = windowLayers.find((layer) => layer.kind === 'text')!;
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
      { ...rulesLayer, content: 'Rules above the decal window.', offset: [-370, -331.5], height: 120 },
      {
        ...rulesLayer,
        layerId: '30000000-3000-4000-8000-300000000003',
        content: 'Rules below the decal window.',
        offset: [-370, 508.5],
        size: 30,
        height: 45,
      },
    ],
  },
  /* At the largest offset the window still closes above the card's bottom edge, and the text below it sits between the two. */
  play: async ({ canvasElement }) => {
    const hole = canvasElement.querySelector('mask rect[fill="black"]')!;
    const frame = hole.closest('svg')!;
    const windowBottom = Number(hole.getAttribute('y')) + Number(hole.getAttribute('height'));
    await expect(windowBottom).toBeLessThanOrEqual(1263);
    const card = frame.getBoundingClientRect();
    /* The window's edge is in the frame's 1263-unit card space, so scale it to the rendered card before comparing it with the text. */
    const windowBottomOnScreen = card.top + (windowBottom * card.height) / 1263;
    const below = within(canvasElement).getByText('Rules below the decal window.').getBoundingClientRect();
    await expect(below.top).toBeGreaterThanOrEqual(windowBottomOnScreen);
    await expect(below.bottom).toBeLessThanOrEqual(card.bottom);
  },
});
export const LongTitle = meta.story({
  args: { name: 'A very long custom card title that must fit inside the Head' },
  play: async ({ args, canvasElement }) => expectTitleFits(canvasElement, args.name),
});

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
  play: async ({ args, canvasElement }) => expectTitleFits(canvasElement, args.name),
});
