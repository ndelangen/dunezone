import type { ComponentProps } from 'react';

import { factionTokenFixtures } from '../../fixtures/factionTokens';
import type { BattleWheel } from './BattleWheel';

export const artwork = factionTokenFixtures.atreides;
export const troop = {
  id: 'regular',
  name: 'Regular troops',
  dialed: 3,
  undialed: 2,
  artwork: {
    background: artwork.background,
    image: '/vector/troop/atreides.svg',
    star: undefined,
    hue: undefined,
    striped: undefined,
  },
} satisfies Extract<ComponentProps<typeof BattleWheel>, { state: 'revealed' }>['troops'][number];

export const revealedArgs = {
  state: 'revealed',
  label: 'Atreides battle plan',
  background: artwork.background,
  strength: 3 * 1 + 2 * 0.5,
  spice: 3,
  adjustment: 0,
  troops: [troop],
} satisfies ComponentProps<typeof BattleWheel>;
