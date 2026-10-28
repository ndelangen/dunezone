import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { DarkSchemeIsland, darkSchemeIslandAttributes } from '../DarkSchemeIsland';
import { MovementTurns } from './MovementTurns';
import { TableMovementTurns, names, order, table } from './movementTurns.stories.fixture';

const meta = preview.meta({
  component: MovementTurns,
  title: 'Play/Panels/Shipment and Movement turns',
  parameters: { layout: 'centered' },
  args: { table, names, order, done: [], canAct: true, onDone: fn(), onUndo: fn(), onOrder: fn() },
  render: (args) => <TableMovementTurns {...args} />,
  /* The row sits in the header chip over the table, so it shows on the table's dark ground. */
  decorators: [
    (Story) => (
      <DarkSchemeIsland>
        <div {...darkSchemeIslandAttributes} style={{ padding: 16, borderRadius: 12, background: 'var(--ui-ground)' }}>
          <Story />
        </div>
      </DarkSchemeIsland>
    ),
  ],
});

/** The phase just begun: every faction in storm order, the first ringed as up now. */
export const NobodyDone = meta.story({});

/** Two factions done: each faded under a tick, and the ring on the third. */
export const SomeDone = meta.story({
  args: { done: order.slice(0, 2) },
});

/** The table moved the fourth faction to the front, so it is up now ahead of storm order. */
export const Rearranged = meta.story({
  args: { order: [order[3]!, ...order.filter((factionId) => factionId !== order[3])] },
});

/** Every faction done: the whole row faded and no ring left. */
export const EveryoneDone = meta.story({
  args: { done: [...order] },
});

/** An observer sees the same row without a press or a drag on it. */
export const Observer = meta.story({
  args: { done: order.slice(0, 1), canAct: false },
});
