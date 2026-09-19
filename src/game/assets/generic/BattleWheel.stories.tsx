import preview from '@sb/preview';
import type { ComponentProps } from 'react';

import { backgroundPresets } from '../../data/backgrounds';
import { card } from '../../data/sizes';
import { factionTokenFixtures } from '../../fixtures/factionTokens';
import { CardBack } from '../card/Back';
import { LeaderToken } from '../faction/leader/Leader';
import { BattleWheel } from './BattleWheel';

const artwork = factionTokenFixtures.atreides;
const troop = {
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
} satisfies ComponentProps<typeof BattleWheel>['troops'][number];

const meta = preview.meta({
  component: BattleWheel,
  parameters: { layout: 'centered' },
  args: {
    label: 'Atreides battle plan',
    background: artwork.background,
    strength: 3,
    spice: 3,
    adjustment: 0,
    troops: [troop],
  },
});

export const NoLeader = meta.story({});
export const Empty = meta.story({ args: { strength: 0, spice: 0, troops: [] } });
export const WithLeader = meta.story({
  args: {
    leader: (
      <div style={{ width: 60, height: 60 }}>
        <LeaderToken
          background={artwork.background}
          image="/image/leader/official/tessia.png"
          logo="/vector/logo/atreides.svg"
          name="Tessia"
          strength="5"
        />
      </div>
    ),
  },
});
export const WithCards = meta.story({
  args: {
    cards: [
      ...['First battle card', 'Second battle card'].map((name) => (
        <div key={name} style={{ width: 60, height: (60 * card.height) / card.width }}>
          <div
            style={{
              width: card.width,
              height: card.height,
              transform: `scale(${60 / card.width})`,
              transformOrigin: 'top left',
            }}
          >
            <CardBack
              name={name}
              background={backgroundPresets.traitor}
              image="/vector/icon/traitor.svg"
              imageOffset={[0, 10]}
              imageScale={1.1}
            />
          </div>
        </div>
      )),
    ],
    adjustment: 1.5,
    strength: 4.5,
  },
});
export const MultipleTroopFaces = meta.story({
  args: {
    troops: [
      troop,
      {
        ...troop,
        id: 'elite',
        name: 'Elite troops',
        dialed: 1,
        undialed: 0,
        artwork: { ...troop.artwork, star: '/vector/troop_modifier/star-right.svg' },
      },
    ],
    adjustment: -0.5,
    strength: 4.5,
  },
});
export const CustomArtwork = meta.story({
  args: {
    label: 'Harkonnen battle plan',
    background: factionTokenFixtures.harkonnen.background,
    troops: [
      {
        ...troop,
        artwork: {
          ...troop.artwork,
          background: factionTokenFixtures.harkonnen.background,
          image: '/vector/troop/harkonnen.svg',
        },
      },
    ],
  },
});
