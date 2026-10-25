import { testingPreview } from '@sb/preview';
import discoverySpiceCards from '@shared/assets/fixtures/discoverySpiceCards.json';
import { discoveryTokenFronts } from '@shared/assets/fixtures/discoveryTokens';
import { spiceBoardTokens } from '@shared/assets/fixtures/spiceBoardCard';
import { SpiceAsset } from '@shared/assets/schema';
import { arrakisBoard } from '@shared/boards/geometry';
import { expect } from 'storybook/test';

import { CardGallery, GalleryCard } from './CardGallery.stories.fixture';
import { SpiceCard } from './Spice';
import { discoveryOnBoard } from './Spice.stories.fixture';

const meta = testingPreview.meta({
  title: 'Spice',
  component: SpiceCard,
  globals: {
    viewport: {
      value: 'card',
    },
  },
});

/** The six accepted Discovery faces, using native board geometry and linked token fronts. */
export const DiscoveryCards = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <CardGallery>
      {discoverySpiceCards.map((data) => {
        const card = SpiceAsset.parse(data);
        return (
          <GalleryCard key={card.name} label={card.name}>
            <SpiceCard {...card} boardDefinition={arrakisBoard()} boardTokens={discoveryTokenFronts} />
          </GalleryCard>
        );
      })}
    </CardGallery>
  ),
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const cards = canvasElement.querySelectorAll<HTMLElement>('[data-spice-look="textured-burn"]');
    await expect(cards).toHaveLength(6);
    for (const card of cards) {
      const map = card.querySelector<SVGElement>('svg[data-look="textured-burn"]')!;
      const tint = card.querySelector<SVGElement>('svg:has([data-tint])')!;
      const marker = card.querySelector<HTMLElement>('[data-token-instance]')!.parentElement!;
      await expect(map.getBoundingClientRect().top).toBe(tint.getBoundingClientRect().top);
      await expect(map.getBoundingClientRect().top).toBe(marker.getBoundingClientRect().top);
      await expect(card.querySelectorAll('[data-tint]')).toHaveLength(2);
      await expect(card.querySelectorAll('[data-token-instance]')).toHaveLength(2);
      await expect(card.querySelectorAll('[data-spice-type-token]')).toHaveLength(1);
      await expect([...card.querySelectorAll('strong')].map((e) => e.textContent)).toHaveLength(2);
      const body = card.querySelector('strong')!.closest('div')!;
      await expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
      await expect(getComputedStyle(map).filter).toBe('saturate(0) contrast(2.6) brightness(0.55)');
      await expect(getComputedStyle(tint).filter).toBe('none');
      await expect(getComputedStyle(marker).filter).toBe('none');
    }
  },
});

/** Renaming a territory keeps its ID, so the card's tint on it still draws. */
export const RenamedTerritory = meta.story({
  args: {
    ...discoveryOnBoard,
    boardDefinition: (() => {
      const board = arrakisBoard();
      const key = Object.keys(board.properties).find((k) => board.properties[k].name === 'Funeral plain')!;
      board.properties[key] = { ...board.properties[key], name: 'Funeral flats' };
      return board;
    })(),
    boardTokens: spiceBoardTokens,
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-tint="blow"] > g').length).toBeGreaterThan(0);
  },
});
