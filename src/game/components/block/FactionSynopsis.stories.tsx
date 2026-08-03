import preview from '@sb/preview';

import { factionTokenFixtures } from '../../fixtures/factionTokens';
import { FactionSynopsis } from './FactionSynopsis';

const meta = preview.meta({
  title: 'Faction Synopsis',
  component: FactionSynopsis,
  args: {},
});

export const Default = meta.story({
  args: {
    token: factionTokenFixtures.choam,
    children:
      'CHOAM turns commercial influence into leverage over the factions competing for Arrakis.',
    flip: false,
  },
});

export const Flipped = meta.story({
  args: {
    token: factionTokenFixtures.choam,
    children:
      'CHOAM turns commercial influence into leverage over the factions competing for Arrakis.',
    flip: true,
  },
});
