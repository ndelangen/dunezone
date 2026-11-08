import preview from '@sb/preview';

import { battleSetup } from './battles.stories.fixture';
import { gameMeta } from './game.stories.fixture';
import { trial } from './motionTrials.stories.fixture';

/*
 * Animation trials for the battle panel arriving over its marker. Each story is one candidate; Replay restarts it.
 * Once one is chosen, it becomes the panel's own arrival and these trials go.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Animation trials/Battle panel arrives',
  globals: { motion: 'on' },
  beforeEach: battleSetup('preparing'),
});

/** Today: the panel appears at once. */
export const Current = meta.story({});

/** Grows out of the marker, overshoots a hair and settles. 300 ms. */
export const Spring = meta.story({ decorators: [trial('battle-pop', 'spring')] });

/** Set down from a little above, with the Panel edge's two-step knock. 400 ms. */
export const Drop = meta.story({ decorators: [trial('battle-pop', 'drop')] });

/** The panel opens, then both sides charge in from the edges, meet and recoil once. 420 ms. */
export const Clash = meta.story({ decorators: [trial('battle-pop', 'clash')] });

/** Unrolls sideways out of the marker like a map, then its contents fade up. 320 ms. */
export const Unroll = meta.story({ decorators: [trial('battle-pop', 'unroll')] });

/** Lands heavily, a touch too big, and shudders once. 340 ms. */
export const Thud = meta.story({ decorators: [trial('battle-pop', 'thud')] });
