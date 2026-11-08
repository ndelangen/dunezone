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

function BattleTrial({ claim }: { claim: string }) {
  useTrialVariant('battle-pop', 'reach');
  useTrialVariant('claim', claim);
  useEffect(() => {
    /* Long enough for the table's own arrival to finish. */
    const timer = setTimeout(declare, 4000);
    return () => {
      clearTimeout(timer);
      steps.forEach(clearTimeout);
    };
  }, []);
  return <TrialButton onClick={declare}>⚔ Start battle ({claim} claims)</TrialButton>;
}

function battleTrial(claim: string): Decorator {
  return (Story) => (
    <>
      <Story />
      <BattleTrial claim={claim} />
    </>
  );
}

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Animation trials/Battle panel claims',
  globals: { motion: 'on' },
  beforeEach: install(() => productTransport('seat-2', quiet())),
});

/** Reach, then each claimed token pops up out of its claim. 280 ms. */
export const ClaimPop = meta.story({ decorators: [battleTrial('pop')] });

/** Reach, then each claimed token is set down from above with the Panel edge's two-step knock. 420 ms. */
export const ClaimDrop = meta.story({ decorators: [battleTrial('drop')] });

/** Reach, then each claim turns over like a coin and comes up as the faction's token. 380 ms. */
export const ClaimFlip = meta.story({ decorators: [battleTrial('flip')] });

/** Reach, then each claimed token charges in from its own edge and knocks against the middle. 420 ms. */
export const ClaimCharge = meta.story({ decorators: [battleTrial('charge')] });
