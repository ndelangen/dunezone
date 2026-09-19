import preview from '@sb/preview';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

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
} satisfies Extract<ComponentProps<typeof BattleWheel>, { state: 'revealed' }>['troops'][number];

const revealedArgs = {
  state: 'revealed',
  label: 'Atreides battle plan',
  background: artwork.background,
  strength: 3,
  spice: 3,
  adjustment: 0,
  troops: [troop],
} satisfies ComponentProps<typeof BattleWheel>;

const meta = preview.meta({
  component: BattleWheel,
  parameters: { layout: 'centered' },
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
    ...revealedArgs,
    cards: ['First battle card', 'Second battle card'].map((name) => (
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
    adjustment: 1.5,
    strength: 4.5,
  },
});
export const MultipleTroopFaces = meta.story({
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
    ],
    adjustment: -0.5,
    strength: 4.5,
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
  decorators: [
    (Story) => (
      <div style={{ width: 180, height: 180 }}>
        <Story />
      </div>
    ),
  ],
});
export const Ready = meta.story({
  args: { state: 'unrevealed', artwork, ready: true, label: 'Atreides, ready' },
  decorators: [
    (Story) => (
      <div style={{ width: 180, height: 180 }}>
        <Story />
      </div>
    ),
  ],
});
function RevealExample() {
  const [revealed, setRevealed] = useState(false);
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 32 }}>
      <div style={{ width: 180, height: 180 }}>
        {revealed ? (
          <BattleWheel
            state="revealed"
            label="Atreides battle plan"
            background={artwork.background}
            strength={3}
            spice={3}
            adjustment={0}
            troops={[troop]}
          />
        ) : (
          <BattleWheel state="unrevealed" label="Atreides, ready" artwork={artwork} ready />
        )}
      </div>
      <button type="button" onClick={() => setRevealed(!revealed)}>
        {revealed ? 'Conceal battle plan' : 'Reveal battle plan'}
      </button>
    </div>
  );
}
export const Reveal = meta.story({
  render: () => <RevealExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Atreides, ready' })).toBeVisible();
    await expect(canvas.queryByText('No leader')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Reveal battle plan' }));
    await expect(canvas.queryByRole('img', { name: 'Atreides, ready' })).toBeNull();
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
  },
});
