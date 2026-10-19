import preview from '@sb/preview';
import { spiceBoardLink, spiceBoardTokens } from '@shared/assets/fixtures/spiceBoardCard';
import { arrakisBoard } from '@shared/boards/geometry';
import { resolveAsset } from '@shared/media/resolveAsset';
import type { ComponentProps } from 'react';
import { expect } from 'storybook/test';

import { CardGallery, GalleryCard } from './CardGallery.stories.fixture';
import { SpiceCard } from './Spice';

type SpiceCardProps = ComponentProps<typeof SpiceCard>;
type Territory = SpiceCardProps['highlights'][number];

function mine(name: string, territory: Territory, amount: number): SpiceCardProps {
  return { name, subName: 'Spice mine', icon: 'spice-mine', highlights: [territory], amount };
}

function blow(name: string, territory: Territory, amount: number): SpiceCardProps {
  return { name, subName: 'Spice blow', icon: 'spice', highlights: [territory], amount };
}

function discovery(name: string, highlights: Territory[], text: string): SpiceCardProps {
  return { name, subName: 'Spice blow - Discovery', icon: 'spice', highlights, amount: 6, text };
}

/** The territory cards of the deck, each highlighting its own territory; a wrong id draws an empty highlight only the eye catches. */
const SPICE_DECK: SpiceCardProps[] = [
  mine('Gara Kulon', 'gara-kulon', 5),
  mine('Cielago East', 'cielago-east', 5),
  mine('Cielago West', 'cielago-west', 4),
  mine('Bight of the Cliff', 'bight-of-the-cliff', 4),
  blow('Broken Land', 'broken-land', 8),
  blow('Cielago North', 'cielago-north', 8),
  blow('Cielago South', 'cielago-south', 12),
  blow('Funeral Plain', 'funeral-plain', 6),
  blow('Habbanya Erg', 'habbanya-erg', 8),
  blow('Habbanya Ridge Flat', 'habbanya-ridge-flat', 10),
  blow('Hagga Basin', 'hagga-basin', 6),
  blow('Old Gap', 'old-gap', 6),
  blow('Red Chasm', 'red-chasm', 8),
  blow('Rock Outcroppings', 'rock-outcroppings', 6),
  blow('Sihaya Ridge', 'sihaya-ridge', 6),
  blow('South Mesa', 'south-mesa', 10),
  blow('The Great Flat', 'the-great-flat', 10),
  blow('The Minor Erg', 'the-minor-erg', 8),
  blow('Wind Pass North', 'wind-pass-north', 6),
  discovery(
    'Funeral Plain',
    ['funeral-plain', 'pasty-mesa'],
    `**Smuggler token** on Pasty Mesa\n+\n**6 spice** on Funeral Plain`
  ),
  discovery(
    'Hagga Basin',
    ['hagga-basin', 'gara-kulon'],
    `**Hiereg token** on Gara Kulon\n+\n**6 spice** on Hagga Basin`
  ),
  discovery(
    'Old Gap',
    ['old-gap', 'false-wall-west'],
    `**Smuggler token** on False Wall West\n+\n**6 spice** on Old Gap`
  ),
  discovery(
    'Rock Outcroppings',
    ['rock-outcroppings', 'meridian'],
    `**Hiereg token** on Meridian\n+\n**6 spice** on Rock Outcroppings`
  ),
  discovery(
    'Sihaya Ridge',
    ['sihaya-ridge', 'cielago-east'],
    `**Hiereg token** on Cielago East\n+\n**6 spice** on Sihaya Ridge`
  ),
];

const meta = preview.meta({
  component: SpiceCard,
  globals: {
    viewport: {
      value: 'card',
    },
  },
});

export const Arsunt = meta.story({
  args: {
    name: 'Arsunt',
    subName: 'Spice mine',
    icon: 'spice-mine',
    highlights: ['arsunt'],
    amount: 3,
  },
  play: async ({ canvasElement }) => {
    const shape = Array.from(canvasElement.querySelectorAll<HTMLElement>('div')).find((element) =>
      getComputedStyle(element).backgroundImage.includes('/image/card/base-full-large.webp')
    );

    await expect(shape).toBeDefined();
    await expect(getComputedStyle(shape as HTMLElement).backgroundSize).toBe('100% 100%');
  },
});

export const DiscoveryWindPassNorth = meta.story({
  args: {
    name: 'Wind Pass North',
    subName: 'Spice blow - Discovery',
    icon: 'spice',
    highlights: ['wind-pass-north', 'plastic-basin'],
    amount: 6,
    text: `**Smuggler token** on Plastic Basin\n+\n**6 spice** on Wind Pass North`,
    overlays: [
      {
        image: '/image/texture/052.jpg',
        offset: [21.6, 16.4],
        scale: 6.2,
      },
    ],
  },
  /* The overlay draws once on the map, at its authored offset and scale. */
  play: async ({ canvasElement }) => {
    const href = resolveAsset('/image/texture/052.jpg', 'large');
    const overlays = Array.from(canvasElement.querySelectorAll('svg image')).filter(
      (image) => image.getAttribute('href') === href
    );
    await expect(overlays).toHaveLength(1);
    await expect(overlays[0]).toHaveAttribute('x', '21.6');
    await expect(overlays[0]).toHaveAttribute('y', '16.4');
    await expect(overlays[0]).toHaveAttribute('width', '6.2');
  },
});

/** The deck in one view, so each card's territory highlight and discovery text can be checked by eye against the others. */
export const SpiceDeck = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <CardGallery>
      {SPICE_DECK.map((spice) => (
        <GalleryCard key={`${spice.subName} ${spice.name}`} label={`${spice.name}, ${spice.subName}`}>
          <SpiceCard {...spice} />
        </GalleryCard>
      ))}
    </CardGallery>
  ),
});

const discoveryOnBoard: SpiceCardProps = {
  name: 'Funeral Plain',
  subName: 'Spice blow - Discovery',
  icon: 'spice',
  highlights: [],
  amount: 6,
  text: `**Smuggler token** on Pasty Mesa\n+\n**6 spice** on Funeral Plain`,
  board: spiceBoardLink,
};

/** A card linked to a saved board: Play tints over the board's own artwork, then tokens placed freely. */
export const OnSavedBoard = meta.story({
  args: { ...discoveryOnBoard, boardDefinition: arrakisBoard(), boardTokens: spiceBoardTokens },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-tint]')).toHaveLength(3);
    /* The type-wide tint covers every stronghold on the board. */
    await expect(canvasElement.querySelectorAll('[data-tint="strongholds"] > g')).toHaveLength(5);
    await expect(canvasElement.querySelectorAll('[data-tint-sticker="spice"]')).toHaveLength(1);
    await expect(canvasElement.querySelectorAll('[data-token-instance]')).toHaveLength(4);
  },
});

/** A board the card names but no longer has a territory of: the rest still draws. */
export const MissingTerritory = meta.story({
  args: {
    ...discoveryOnBoard,
    boardDefinition: (() => {
      const board = arrakisBoard();
      const key = Object.keys(board.properties).find((k) => board.properties[k].name === 'Funeral plain')!;
      /* A territory that is no longer on the board: another one stands where it was. A rename alone keeps its ID and its tint. */
      board.properties[key] = { ...board.properties[key], name: 'Funeral flats', id: 'funeral_flats' };
      return board;
    })(),
    boardTokens: spiceBoardTokens,
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-tint="blow"] > g')).toHaveLength(0);
    await expect(canvasElement.querySelectorAll('[data-tint="strongholds"] > g')).toHaveLength(5);
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

/** A linked board that is gone draws an empty map, never the legacy Arrakis one. */
export const MissingBoard = meta.story({
  args: { ...discoveryOnBoard, boardDefinition: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-missing-board]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-tint]')).toBeNull();
  },
});
