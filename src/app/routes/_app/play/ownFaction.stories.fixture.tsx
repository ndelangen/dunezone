import type { GameSnapshot } from '@shared/play/protocol';
import type { Decorator } from '@storybook/tanstack-react';
import { within } from 'storybook/test';

import { draftingSnapshot } from './drafting.stories.fixture';
import { install } from './game.stories.fixture';
import { OwnFactionCueContext } from './multiplayer/OwnFaction';
import type { OwnFactionCue } from './multiplayer/OwnFaction';
import { productTransport, SIX, swappingSnapshot } from './product.stories.fixture';

/* PROTOTYPE (#2987): the seat the stories watch the deal from. */
const VIEWER = 'seat-2';

let live: ReturnType<typeof productTransport> | null = null;

/** Shows the table with one way of telling the viewer their faction. */
export const withCue =
  (cue: OwnFactionCue): Decorator =>
  (Story) => (
    <OwnFactionCueContext value={cue}>
      <Story />
    </OwnFactionCueContext>
  );

/** Every player has drafted and readied: the deal is a moment away. */
export const beforeTheDeal = install(() => {
  const ready = SIX.map((player) => player.seat);
  live = productTransport(VIEWER, draftingSnapshot(SIX, 6, { ready }));
  return live;
});

/** The deal lands two seconds after the drafting table shows: every seat gets its faction, and Trading begins. */
export async function dealFactions(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByRole('button', { name: /^Controls/ }, { timeout: 30_000 });
  await new Promise((resolve) => window.setTimeout(resolve, 2000));
  const dealt: GameSnapshot = swappingSnapshot();
  dealt.revision += 10;
  live!.deliver(live!.view(dealt));
}
