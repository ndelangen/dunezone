import preview from '@sb/preview';
import type { Decorator } from '@storybook/tanstack-react';

import { gameMeta, install } from './game.stories.fixture';
import { chapter, journeyViewers, JourneyPage } from './journey.stories.fixture';
import { BattleBeaconVariantContext } from './multiplayer/BattleBeacon';
import type { BeaconVariant } from './multiplayer/BattleBeacon';
import { sandboxDecorator, sandboxSteps, sandboxTransport } from './sandbox.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Battle beacon',
  component: JourneyPage,
  args: { ...gameMeta.args, step: chapter('Battle'), seat: 'seat-1' },
  argTypes: {
    step: {
      control: { type: 'range', min: sandboxSteps()[0]! + 1, max: sandboxSteps().at(-1)! + 1, step: 1 },
    },
    seat: { control: 'select', options: journeyViewers() },
  },
  parameters: {
    ...gameMeta.parameters,
    controls: { disable: false, include: ['step', 'seat'] },
    docs: {
      description: {
        component:
          "The live sandbox table at the Battle phase, one story per beacon design. Pick the beacon up over the tracker's Battle disc and drop it on a territory; cancel or resolve the battle to see it sink and a new one rise; change phase to see it sink into the table and rise again.",
      },
    },
  },
  beforeEach: ({ args }) =>
    install(() => sandboxTransport({ start: Number(args.step ?? 1) - 1, seat: String(args.seat ?? 'seat-1') }))(),
  decorators: [...gameMeta.decorators, sandboxDecorator],
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const variant =
  (design: BeaconVariant): Decorator =>
  (Story) => (
    <BattleBeaconVariantContext value={design}>
      <Story />
    </BattleBeaconVariantContext>
  );

/** A: a dark spike with two orbiting rings, a beam and a rotating crosshair; it lands as a flat diamond inside its rings. */
export const OrbitalLance = meta.story({ decorators: [variant('lance')] });
/** B: an inverted pyramid with a laser and lock-on brackets that keep tightening; it lands as a flat triangle, locked. */
export const LaserDesignator = meta.story({ decorators: [variant('designator')] });
/** C: a hex puck projecting a column of light with climbing scan lines and ground ripples; it lands as a flat hex with small ripples. */
export const HoloPylon = meta.story({ decorators: [variant('pylon')] });
/** D: a finned saucer throwing a cone of light onto a target; it folds its fins and sets down flat on the target. */
export const UplinkDrone = meta.story({ decorators: [variant('drone')] });
