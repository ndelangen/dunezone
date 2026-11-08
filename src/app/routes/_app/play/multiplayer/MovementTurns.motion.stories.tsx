import preview from '@sb/preview';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { trial } from '../motionTrials.stories.fixture';
import { names, order, table, TableMovementTurns } from './movementTurns.stories.fixture';

/* The row as the table plays it: click a token to mark its faction done, click again to take it back. */
function TurnsTrial() {
  const [done, setDone] = useState<string[]>([]);
  return (
    <TableMovementTurns
      table={table}
      names={names}
      order={order}
      done={done}
      canAct
      onDone={(id) => setDone([...done, id])}
      onUndo={(id) => setDone(done.filter((other) => other !== id))}
      onOrder={fn()}
    />
  );
}

/*
 * Animation trials for a faction marked done in the Shipment and Movement turns. Click a token in each story to see it.
 * Once one is chosen, it becomes the row's own and these trials go.
 */
const meta = preview.meta({
  title: 'Play/Animation trials/Movement turn done',
  parameters: { layout: 'centered' },
  globals: { motion: 'on' },
  render: () => <TurnsTrial />,
  decorators: [
    (Story) => (
      <DarkSchemeIsland>
        <div {...darkSchemeIslandAttributes} style={{ padding: 24, borderRadius: 12, background: 'var(--ui-ground)' }}>
          <Story />
        </div>
      </DarkSchemeIsland>
    ),
  ],
});

/** Today: the token fades and the tick appears at once. */
export const Current = meta.story({});

/** The tick pops onto the token. 240 ms. */
export const Pop = meta.story({ decorators: [trial('turn-done', 'pop')] });

/** The tick comes down like a rubber stamp and the token gives under it. 520 ms. */
export const Stamp = meta.story({ decorators: [trial('turn-done', 'stamp')] });

/** The token hops into its place among the finished and lands with a two-step knock; the tick follows. 480 ms. */
export const Hop = meta.story({ decorators: [trial('turn-done', 'hop')] });
