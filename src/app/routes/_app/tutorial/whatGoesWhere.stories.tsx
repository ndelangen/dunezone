import preview from '@sb/preview';
import type { Decorator } from '@storybook/tanstack-react';
import type { Vector3Tuple } from 'three';

import { gameMeta, install } from '../play/game.stories.fixture';
import { chapter, JourneyPage } from '../play/journey.stories.fixture';
import { sandbox, sandboxTransport } from '../play/sandbox.stories.fixture';
import { TableTour } from './TableTour';
import type { TourStop } from './TableTour';

/*
 * Chapter 5, "What goes where", as a first rough cut: the live sandbox table at the start of turn 1, seen as seat 1,
 * with numbered marks on each part of the screen and a card that walks through them.
 */

const pieces = () => sandbox.table?.frame().snapshot.table.pieces ?? [];
const mine = () => sandbox.table?.frame().snapshot.bank?.factionId;

/* The middle of the first table piece that matches, where the page draws it. */
const pieceAt = (match: (piece: ReturnType<typeof pieces>[number]) => boolean) => (): Vector3Tuple | null => {
  const found = pieces().find((piece) => !piece.inventory && match(piece));
  return found ? (found.position as Vector3Tuple) : null;
};

const page = (selector: string) => () => document.querySelector(selector);

const STOPS: TourStop[] = [
  {
    id: 'board',
    title: 'The board',
    body: 'Arrakis, in the middle of the table. Troops, spice and the storm all live here, and you move them by hand.',
    anchor: { kind: 'table', point: () => [0, 0, 0] },
  },
  {
    id: 'you',
    title: 'Your seat',
    body: 'Your faction token and your reserves sit on the rim nearest you. Drag a stack of troops onto a territory to ship it.',
    anchor: {
      kind: 'table',
      point: pieceAt((piece) => piece.kind === 'force' && piece.stackKey === `faction-token:${mine()}`),
    },
  },
  {
    id: 'others',
    title: 'The other players',
    body: 'Every other faction sits around the rim in storm order, with its token and reserves in front of it.',
    anchor: {
      kind: 'table',
      point: pieceAt(
        (piece) => !!piece.stackKey?.startsWith('faction-token:') && piece.stackKey !== `faction-token:${mine()}`
      ),
    },
  },
  {
    id: 'treachery',
    title: 'Treachery deck',
    body: 'Drag the top card into your hand, or right-click the deck to shuffle or peek.',
    anchor: { kind: 'table', point: pieceAt((piece) => piece.stackKey === 'deck:treachery-deck') },
  },
  {
    id: 'spice-deck',
    title: 'Spice deck',
    body: 'Turn over the next Spice card in the Spice Blow, and play it onto its territory.',
    anchor: { kind: 'table', point: pieceAt((piece) => piece.stackKey === 'deck:spice-deck') },
  },
  {
    id: 'tracker',
    title: 'Turn and phase tracker',
    body: 'The discs along the top of the board count the turns, and the lit disc is the phase you are in.',
    anchor: { kind: 'table', point: () => [-1.6, 0.1, -5.4] },
  },
  {
    id: 'phase',
    title: 'Where the game is',
    body: 'The header says the turn and the phase. It reads the same for every player.',
    anchor: { kind: 'page', element: page('header.seated-header > :first-child') },
  },
  {
    id: 'next',
    title: 'Next phase',
    body: 'Anyone can move the game on when the table is ready. The arrow beside it holds the other phase actions.',
    anchor: { kind: 'page', element: page('[aria-label="Phase navigation"]') },
  },
  {
    id: 'camera',
    title: 'Camera',
    body: 'Jump to the map, or to the left, right or bottom of the table. Drag on the table to tilt, scroll to zoom.',
    anchor: { kind: 'page', element: page('[aria-label="Table view"]') },
  },
  {
    id: 'yours',
    title: 'Your controls',
    body: 'Your hand, your hidden zone and your spice, then the game, the table and its history. Only you see the first tab.',
    anchor: { kind: 'page', element: page('aside[aria-label="Table controls"] [role="tablist"]') },
  },
  {
    id: 'players',
    title: 'Players and messages',
    body: 'Talk to the whole table, or open a player to message them alone and see what they hold.',
    anchor: { kind: 'page', element: page('aside[aria-label="Players"] [role="tablist"]') },
  },
];

const tourDecorator: Decorator = (Story) => (
  <>
    <Story />
    <TableTour title="What goes where" stops={STOPS} />
  </>
);

const meta = preview.meta({
  ...gameMeta,
  title: 'Tutorial/What goes where',
  component: JourneyPage,
  args: { ...gameMeta.args, step: chapter('Turn 1: Storm'), seat: 'seat-1' },
  beforeEach: ({ args }) =>
    install(() => sandboxTransport({ start: Number(args.step ?? 1) - 1, seat: String(args.seat ?? 'seat-1') }))(),
  decorators: [...gameMeta.decorators, tourDecorator],
  loaders: [
    async () => {
      await import('../play/multiplayer/HostedTable');
    },
  ],
});

/** The live table with the tour over it: step through the parts with Next, and tilt, zoom or pan to see the marks follow. */
export const Tour = meta.story({});
