import preview from '@sb/preview';
import type { ComponentProps } from 'react';
import { expect, within } from 'storybook/test';

import { card } from '../../data/sizes';
import { treacheryCardFixtures } from '../../fixtures/treacheryCards';
import { LeaderToken } from '../faction/leader/Leader';
import { TreacheryCard } from '../treachery/Treachery';
import { BattleWheel } from './BattleWheel';
import { artwork, battleWheelMeta, troop, revealedArgs } from './BattleWheel.stories.fixture';

const wheelCards = [treacheryCardFixtures.maulaPistol, treacheryCardFixtures.shield];

const meta = preview.meta({ ...battleWheelMeta });

export const Revealed = meta.story({ args: revealedArgs });
export const Empty = meta.story({ args: { ...revealedArgs, strength: 0, spice: 0, troops: [] } });
const leaderToken = (name: string, image: ComponentProps<typeof LeaderToken>['image'], strength: string) => (
  <div key={name} style={{ width: 60, height: 60 }}>
    <LeaderToken
      background={artwork.background}
      image={image}
      logo="/vector/logo/atreides.svg"
      name={name}
      strength={strength}
    />
  </div>
);
export const WithLeader = meta.story({
  args: { ...revealedArgs, leaders: [leaderToken('Thufir Hawat', '/image/leader/official/thufir.png', '5')] },
});
/** Several leaders in one plan: the first sits in the slot and the others stack behind it. */
export const WithSeveralLeaders = meta.story({
  args: {
    ...revealedArgs,
    leaders: [
      leaderToken('Thufir Hawat', '/image/leader/official/thufir.png', '5'),
      leaderToken('Duncan Idaho', '/image/leader/official/duncan.png', '2'),
    ],
  },
});
export const WithCards = meta.story({
  args: {
    ...revealedArgs,
    cards: wheelCards.map((front) => (
      <div key={front.name} style={{ width: 60, height: (60 * card.height) / card.width }}>
        <div
          style={{
            width: card.width,
            height: card.height,
            transform: `scale(${60 / card.width})`,
            transformOrigin: 'top left',
          }}
        >
          <TreacheryCard {...front} />
        </div>
      </div>
    )),
    adjustment: 1.5,
    strength: 3 * 1 + 2 * 0.5 + 1.5,
  },
  /* Both played cards sit above the wheel, and a positive adjustment reads as a signed bonus. */
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const { name } of wheelCards) {
      await expect(canvas.getByText(name)).toBeInTheDocument();
    }
    await expect(canvas.getByLabelText('Strength adjustment plus 1.5')).toHaveTextContent('+1.5');
  },
});
export const MultipleTroopFaces = meta.story({
  parameters: {
    docs: {
      description: {
        story:
          'Custom elite troops contribute 2 strength when supported. Regular troops contribute 1 when supported and 0.5 otherwise. A third reserve face uses regular strength. Twelve regular troops sit beside single-digit elite and reserve counts. Twelve supported troops cost 12 spice; the -0.5 adjustment leaves 13.5 strength.',
      },
    },
  },
  args: {
    ...revealedArgs,
    troops: [
      { ...troop, dialed: 10, undialed: 2 },
      {
        ...troop,
        id: 'elite',
        name: 'Elite troops',
        dialed: 1,
        undialed: 0,
        artwork: { ...troop.artwork, star: '/vector/troop_modifier/star-right.svg' },
      },
      {
        ...troop,
        id: 'reserve',
        name: 'Reserve troops',
        dialed: 1,
        undialed: 0,
        artwork: { ...troop.artwork, striped: true },
      },
    ],
    spice: 12,
    adjustment: -0.5,
    strength: 10 * 1 + 2 * 0.5 + 1 * 2 + 1 * 1 - 0.5,
  },
});

export const Unrevealed = meta.story({
  args: { state: 'unrevealed', artwork, ready: false, label: 'Atreides, preparing' },
});
export const Ready = meta.story({
  args: { state: 'unrevealed', artwork, ready: true, label: 'Atreides, ready' },
});

const halfStyles = [
  { halves: 'decimal', name: 'Today: decimals' },
  { halves: 'copperplate', name: 'A: ½ from Copperplate' },
  { halves: 'candara', name: 'B: ½ from Candara' },
  { halves: 'slashed', name: 'C: Advokat ¹⁄₂, slashed' },
  { halves: 'stacked', name: 'D: Advokat ½, stacked' },
] as const;

/** The wheel's Advokat face has no ½ glyph, so each option either borrows one from another face or builds it from Advokat's digits. Compared at the size the wheel is drawn. */
export const HalvesAsFractions = meta.story({
  tags: ['!test'],
  parameters: { layout: 'padded' },
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, max-content)', gap: 24, alignItems: 'start' }}>
      {halfStyles.map(({ halves, name }) => (
        <figure key={halves} style={{ margin: 0, display: 'grid', gap: 12, justifyItems: 'center' }}>
          <BattleWheel {...revealedArgs} halves={halves} strength={2.5} adjustment={-0.5} />
          <BattleWheel {...revealedArgs} halves={halves} strength={13.5} adjustment={1.5} />
          <BattleWheel {...revealedArgs} halves={halves} strength={0.5} />
          <figcaption style={{ font: '13px system-ui' }}>{name}</figcaption>
        </figure>
      ))}
    </div>
  ),
});
