import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { card } from '../../data/sizes';
import { treacheryCardFixtures } from '../../fixtures/treacheryCards';
import { LeaderToken } from '../faction/leader/Leader';
import { TreacheryCard } from '../treachery/Treachery';
import { BattleWheel } from './BattleWheel';
import { artwork, troop, revealedArgs } from './BattleWheel.stories.fixture';

const wheelCards = [treacheryCardFixtures.maulaPistol, treacheryCardFixtures.shield];

const meta = preview.meta({
  component: BattleWheel,
  parameters: { layout: 'centered' },
  argTypes: {
    state: { control: 'radio', options: ['unrevealed', 'revealed'] },
    strength: { description: 'Troop strength including adjustment, excluding the leader.' },
  },
  render: (args) =>
    args.state === 'unrevealed' ? (
      <div style={{ width: 170, height: 170 }}>
        <BattleWheel {...args} artwork={args.artwork ?? artwork} ready={args.ready ?? false} />
      </div>
    ) : (
      <BattleWheel {...revealedArgs} {...args} />
    ),
});

export const Revealed = meta.story({ args: revealedArgs });
export const Empty = meta.story({ args: { ...revealedArgs, strength: 0, spice: 0, troops: [] } });
export const WithLeader = meta.story({
  args: {
    ...revealedArgs,
    leader: (
      <div style={{ width: 60, height: 60 }}>
        <LeaderToken
          background={artwork.background}
          image="/image/leader/official/thufir.png"
          logo="/vector/logo/atreides.svg"
          name="Thufir Hawat"
          strength="5"
        />
      </div>
    ),
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
