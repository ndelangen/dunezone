import preview from '@sb/preview';

import { factionTokenFixtures } from '@game/fixtures/factionTokens';
import atreides from '@game/fixtures/sceneAtreides';

import type { BattlePlanFaceProps } from './BattlePlanFace';
import { BattlePlanFace } from './BattlePlanFace';

const meta = preview.meta({
  component: BattlePlanFace,
  parameters: { layout: 'centered' },
  args: {
    name: 'Fremen',
    background: factionTokenFixtures.fremen.background,
    troopImage: '/vector/troop/fremen.svg',
    leader: null,
    strength: 5,
    troops: 6,
    spice: 4,
  } as BattlePlanFaceProps,
});
export const WithoutLeader = meta.story({});
export const Adjusted = meta.story({ args: { strength: 6, adjustment: 1 } });

export const WithLeader = meta.story({
  args: {
    name: 'House Atreides',
    background: factionTokenFixtures.atreides.background,
    troopImage: '/vector/troop/atreides.svg',
    leader: {
      ...atreides.leaders[4],
      strength: 5,
      logo: factionTokenFixtures.atreides.logo,
      background: factionTokenFixtures.atreides.background,
    },
    strength: 4,
    troops: 5,
    spice: 3,
  },
});
