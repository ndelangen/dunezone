import preview from '@sb/preview';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import { card } from '../../data/sizes';
import { factionTokenFixtures } from '../../fixtures/factionTokens';
import { treacheryCardFixtures } from '../../fixtures/treacheryCards';
import { LeaderToken } from '../faction/leader/Leader';
import { TreacheryCard } from '../treachery/Treachery';
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
} satisfies Extract<ComponentProps<typeof BattleWheel>, { state: 'revealed' }>['troops'][number];

const revealedArgs = {
  state: 'revealed',
  label: 'Atreides battle plan',
  background: artwork.background,
  strength: 3 * 1 + 2 * 0.5,
  spice: 3,
  adjustment: 0,
  troops: [troop],
} satisfies ComponentProps<typeof BattleWheel>;

const meta = preview.meta({
  component: BattleWheel,
  parameters: { layout: 'centered' },
  argTypes: {
    state: { control: 'radio', options: ['unrevealed', 'revealed'] },
    strength: { description: 'Troop force including adjustment, excluding the leader.' },
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
    cards: [treacheryCardFixtures.maulaPistol, treacheryCardFixtures.shield].map((front) => (
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
});
export const MultipleTroopFaces = meta.story({
  parameters: {
    docs: {
      description: {
        story:
          'Custom elite troops contribute 2 force when funded. Regular troops contribute 1 when funded and 0.5 otherwise. A third reserve face uses regular strength. Five funded troops cost 5 spice; the -0.5 adjustment leaves 6.5 force.',
      },
    },
  },
  args: {
    ...revealedArgs,
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
      {
        ...troop,
        id: 'reserve',
        name: 'Reserve troops',
        dialed: 1,
        undialed: 0,
        artwork: { ...troop.artwork, striped: true },
      },
    ],
    spice: 5,
    adjustment: -0.5,
    strength: 3 * 1 + 2 * 0.5 + 1 * 2 + 1 * 1 - 0.5,
  },
});
export const CustomArtwork = meta.story({
  args: {
    ...revealedArgs,
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

export const Unrevealed = meta.story({
  args: { state: 'unrevealed', artwork, ready: false, label: 'Atreides, preparing' },
});
export const Ready = meta.story({
  args: { state: 'unrevealed', artwork, ready: true, label: 'Atreides, ready' },
});
function RevealExample(args: ComponentProps<typeof BattleWheel>) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), 800);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div style={{ width: 170, height: 170 }}>
      <BattleWheel
        {...(started && args.state === 'revealed'
          ? { ...revealedArgs, ...args }
          : args.state === 'unrevealed'
            ? { ...args, artwork: args.artwork ?? artwork, ready: args.ready ?? true }
            : { state: 'unrevealed', label: 'Atreides, ready', artwork, ready: true })}
      />
    </div>
  );
}

export const Reveal = meta.story({
  args: revealedArgs,
  render: (args) => <RevealExample {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wheel = canvas.getByRole('img', { name: 'Atreides, ready' });
    await expect(wheel).toBeVisible();
    await expect(canvas.queryByText('No leader')).toBeNull();
    await waitFor(() => expect(wheel).toHaveAttribute('data-state', 'revealed'));
    await expect(canvas.getByText('No leader')).toBeInTheDocument();
    const animations = canvasElement.getAnimations({ subtree: true });
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const reveal = animations.find((animation) => animation.effect?.getTiming().duration === 400);
      expect(reveal).toBeDefined();
      reveal!.finish();
    } else {
      expect(animations).toHaveLength(0);
    }
    await expect(canvas.getByText('No leader')).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
});
