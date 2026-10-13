import preview from '@sb/preview';

import { gameMeta, install } from './game.stories.fixture';
import { chapter, journeyViewers, JourneyPage } from './journey.stories.fixture';
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
          "The live sandbox table at the Battle phase, with the acrylic strike mark beacon. Pick the beacon up over the tracker's Battle disc and drop it on a territory; cancel or resolve the battle to see it sink and a new one rise; change phase to see it sink into the table and rise again.",
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

/** The acrylic strike mark: pick the disc up over the Battle disc and drop it on a territory. */
export const StrikeMark = meta.story({});
