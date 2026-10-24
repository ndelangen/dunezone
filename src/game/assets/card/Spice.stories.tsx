import preview from '@sb/preview';
import { spiceBoardLink, spiceBoardTokens } from '@shared/assets/fixtures/spiceBoardCard';
import { arrakisBoard } from '@shared/boards/geometry';
import { resolveAsset } from '@shared/media/resolveAsset';
import type { ComponentProps } from 'react';
import { expect } from 'storybook/test';

import { SpiceCard } from './Spice';

type SpiceCardProps = ComponentProps<typeof SpiceCard>;

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

/** Opening a placed token in the editor keeps its shadow without adding a border. */
export const SelectedTokenOnSavedBoard = meta.story({
  args: {
    ...discoveryOnBoard,
    boardDefinition: arrakisBoard(),
    boardTokens: spiceBoardTokens,
    mapEditing: { selectedToken: 't1' },
  },
  play: async ({ canvasElement }) => {
    const token = canvasElement.querySelector<HTMLElement>('[data-token-instance="t1"][data-selected]')!;
    await expect(token).not.toBeNull();
    const style = getComputedStyle(token);
    await expect(style.outlineStyle).toBe('none');
    await expect(style.borderTopWidth).toBe('0px');
    await expect(style.filter).toMatch(/drop-shadow\(.+ 0px 1px 0\.5px\)/);
  },
});

/** A custom palace decal receives the same card treatment as the preset stronghold glyphs. */
export const PalaceOnSavedBoard = meta.story({
  args: {
    name: '',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: [],
    amount: 6,
    board: { asset_id: 'palace-board', tints: [], tokens: [] },
    boardDefinition: (() => {
      const board = arrakisBoard();
      const territory = Object.values(board.properties).find(({ name }) => name === 'Tueks')!;
      territory.decals[0] = { ...territory.decals[0], artwork: '/vector/decal/palace.svg' };
      return board;
    })(),
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
