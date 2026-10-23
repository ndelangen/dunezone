import { fn } from 'storybook/test';

import type { RadialAction } from './RadialMenu';

const FACTIONS = ['Atreides', 'Harkonnen', 'Emperor', 'Spacing Guild', 'Fremen', 'Bene Gesserit'];
export const dealToFremen = fn();
export const closeRing = fn();

export const DECK_ACTIONS: RadialAction[] = [
  { key: 'peek', label: 'Peek at the deck', icon: 'peek', onSelect: fn() },
  { key: 'draw', label: 'Draw a card', icon: 'draw', onSelect: fn() },
  {
    key: 'deal',
    label: 'Deal a card',
    icon: 'deal',
    targetsLabel: 'Deal 1 card to…',
    targets: FACTIONS.map((name) => ({
      key: name,
      label: `Deal 1 to ${name}`,
      name,
      face: name.slice(0, 2),
      onSelect: name === 'Fremen' ? dealToFremen : fn(),
    })),
  },
  { key: 'shuffle', label: 'Shuffle', icon: 'shuffle', shortcut: 'R', onSelect: fn() },
  { key: 'delete', label: 'Hold to delete permanently', icon: 'delete', held: true, onSelect: fn() },
];
