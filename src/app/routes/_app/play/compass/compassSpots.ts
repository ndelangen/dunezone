/*
 * The compass's places: the hub (the search field) at its centre, a tile at the end of each arm, and the suggestions below.
 * Left is the hand, twice left the hidden zone; right the table chat, twice right the ally; up the battle plan; down the search.
 */
export type Spot = 'hub' | 'hand' | 'hidden' | 'table' | 'ally' | 'battle' | 'search';

/** The spots that are tiles: everything but the hub and the suggestions. */
export type TileSpot = Exclude<Spot, 'hub' | 'search'>;

export type Arrow = 'left' | 'right' | 'up' | 'down';

/* Where each arrow leads from each spot: outward along an arm, back toward the hub from the other arm. */
export const MOVES: Record<Spot, Record<Arrow, Spot>> = {
  hub: { left: 'hand', right: 'table', up: 'battle', down: 'search' },
  hand: { left: 'hidden', right: 'hub', up: 'battle', down: 'search' },
  hidden: { left: 'hidden', right: 'hand', up: 'battle', down: 'search' },
  table: { left: 'hub', right: 'ally', up: 'battle', down: 'search' },
  ally: { left: 'table', right: 'ally', up: 'battle', down: 'search' },
  battle: { left: 'hand', right: 'table', up: 'battle', down: 'hub' },
  search: { left: 'hand', right: 'table', up: 'hub', down: 'search' },
};

export const ARROWS: Partial<Record<string, Arrow>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};
