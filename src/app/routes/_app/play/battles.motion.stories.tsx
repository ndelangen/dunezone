import preview from '@sb/preview';
import type { GameSnapshot } from '@shared/play/protocol';
import type { Decorator } from '@storybook/tanstack-react';
import { useEffect } from 'react';

import { gameMeta, install, session } from './game.stories.fixture';
import { TrialButton, useTrialVariant } from './motionTrials.stories.fixture';
import { battleStory } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

/*
 * Animation trials for the battle panel arriving over its marker. The table opens with no battle, so its own intro
 * plays out first; a few seconds later, or on "Start battle", the battle is declared and its panel arrives.
 */
const declared = () => battleStory('preparing');
function quiet(): GameSnapshot {
  return { ...declared(), battle: null, battlePlan: null };
}

/* Takes the battle away, then declares it again on the next frame, as a table that just marked one. */
function declare() {
  const { transport } = session;
  if (!transport.connected()) {
    return;
  }
  transport.deliver(transport.view(quiet()));
  requestAnimationFrame(() => requestAnimationFrame(() => transport.deliver(transport.view(declared()))));
}

function BattleTrial({ variant }: { variant?: string }) {
  useTrialVariant('battle-pop', variant);
  useEffect(() => {
    /* Long enough for the table's own arrival to finish. */
    const timer = setTimeout(declare, 4000);
    return () => clearTimeout(timer);
  }, []);
  return <TrialButton onClick={declare}>⚔ Start battle{variant ? ` (${variant})` : ''}</TrialButton>;
}

function battleTrial(variant?: string): Decorator {
  return (Story) => (
    <>
      <Story />
      <BattleTrial variant={variant} />
    </>
  );
}

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Animation trials/Battle panel arrives',
  globals: { motion: 'on' },
  beforeEach: install(() => productTransport('seat-2', quiet())),
});

/** Today: the panel appears at once. */
export const Current = meta.story({ decorators: [battleTrial()] });

/** Grows out of the marker, overshoots a hair and settles. 300 ms. */
export const Spring = meta.story({ decorators: [battleTrial('spring')] });

/** Set down from a little above, with the Panel edge's two-step knock. 400 ms. */
export const Drop = meta.story({ decorators: [battleTrial('drop')] });

/** The panel opens, then both sides charge in from the edges, meet and recoil once. 420 ms. */
export const Clash = meta.story({ decorators: [battleTrial('clash')] });

/** Unrolls sideways out of the marker like a map, then its contents fade up. 320 ms. */
export const Unroll = meta.story({ decorators: [battleTrial('unroll')] });

/** Lands heavily, a touch too big, and shudders once. 340 ms. */
export const Thud = meta.story({ decorators: [battleTrial('thud')] });
