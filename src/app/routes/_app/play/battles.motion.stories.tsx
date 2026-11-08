import preview from '@sb/preview';
import type { GameSnapshot } from '@shared/play/protocol';
import type { Decorator } from '@storybook/tanstack-react';
import { useEffect } from 'react';

import { gameMeta, install, session } from './game.stories.fixture';
import { TrialButton, useTrialVariant } from './motionTrials.stories.fixture';
import { battleStory } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

/*
 * Animation trials for the battle panel's build-up. The table opens with no battle, so its own intro plays out first.
 * A few seconds later, or on "Start battle", a battle is marked with both sides open; then the left side is claimed, then the right.
 */
const declared = () => battleStory('preparing');
function quiet(): GameSnapshot {
  return { ...declared(), battle: null, battlePlan: null };
}
/* The battle with only the first `claimed` sides taken, as the table shows it while the factions claim. */
function claimed(count: number): GameSnapshot {
  const snapshot = declared();
  const battle = snapshot.battle!;
  return {
    ...snapshot,
    battlePlan: count > 0 ? snapshot.battlePlan : null,
    battle: { ...battle, sides: [count > 0 ? battle.sides[0]! : null, count > 1 ? battle.sides[1]! : null] },
  };
}

let steps: ReturnType<typeof setTimeout>[] = [];

/* Takes the battle away, marks it again on the next frame with both sides open, then claims them one at a time. */
function declare() {
  const { transport } = session;
  if (!transport.connected()) {
    return;
  }
  steps.forEach(clearTimeout);
  transport.deliver(transport.view(quiet()));
  requestAnimationFrame(() => requestAnimationFrame(() => transport.deliver(transport.view(claimed(0)))));
  steps = [
    setTimeout(() => transport.deliver(transport.view(claimed(1))), 1600),
    setTimeout(() => transport.deliver(transport.view(claimed(2))), 2600),
  ];
}

function BattleTrial({ variant }: { variant?: string }) {
  useTrialVariant('battle-pop', variant);
  useEffect(() => {
    /* Long enough for the table's own arrival to finish. */
    const timer = setTimeout(declare, 4000);
    return () => {
      clearTimeout(timer);
      steps.forEach(clearTimeout);
    };
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

/** Today: the panel appears at once; claiming a side slaps its token down. */
export const Current = meta.story({ decorators: [battleTrial()] });

/** A narrow stalk rises out of the marker and opens sideways into the panel; the open sides charge in. 680 ms. */
export const Stalk = meta.story({ decorators: [battleTrial('stalk')] });

/** The panel springs up over the marker, its pointer reaches down to it, and the open sides charge in. 680 ms. */
export const Reach = meta.story({ decorators: [battleTrial('reach')] });
