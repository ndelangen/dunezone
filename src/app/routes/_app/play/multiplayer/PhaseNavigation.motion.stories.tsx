import preview from '@sb/preview';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import { useState } from 'react';

import { trial } from '../motionTrials.stories.fixture';
import { ReadyToggle } from './PhaseNavigation';

/* The header's Ready, standing alone: press it to go ready, press again to take it back. Two of five players are ready already. */
function ReadyTrial() {
  const [ready, setReady] = useState(false);
  return <ReadyToggle ready={ready} count={ready ? 3 : 2} of={5} disabled={false} onToggle={() => setReady(!ready)} />;
}

/*
 * Animation trials for the header's Ready. Press Ready in each story to see it; Replay restarts it once it is ready.
 * Once one is chosen, it becomes Ready's own and these trials go.
 */
const meta = preview.meta({
  title: 'Play/Animation trials/Ready',
  parameters: { layout: 'centered' },
  globals: { motion: 'on' },
  render: () => <ReadyTrial />,
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

/** Today: the tick and the count change at once. */
export const Current = meta.story({});

/** The tick pops in, the count bumps up a line. 240 ms. */
export const Pop = meta.story({ decorators: [trial('ready', 'pop')] });

/** The tick comes down like a rubber stamp and the button gives a little under it. 480 ms. */
export const Stamp = meta.story({ decorators: [trial('ready', 'stamp')] });

/** The tick draws itself on with a pen stroke, the count rolls up. 260 ms. */
export const Draw = meta.story({ decorators: [trial('ready', 'draw')] });
