import preview from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { expect } from 'storybook/test';

import { gameMeta } from './game.stories.fixture';
import { beforeTheDeal, dealFactions, VIEWER_FACTION } from './ownFaction.stories.fixture';
import { holdNotices } from './softNotices.stories.fixture';

/*
 * How a player learns which faction is theirs as factions are dealt (#2987): a toast under the header, and their own token in the bottom bar.
 * Each story opens on the drafting table, and the deal lands once it shows. What the toast and the token open is in ownFaction.testing.stories.tsx.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Own faction',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
  decorators: [...gameMeta.decorators, holdNotices],
  beforeEach: beforeTheDeal(),
  globals: { motion: 'on' },
});

/** The deal lands: a toast under the header says which faction is the viewer's, and their own token joins the bottom bar, pulsing as it arrives. */
export const Dealt = meta.story({
  play: async ({ canvasElement }) => {
    const page = await dealFactions(canvasElement);
    const toast = await page.findByRole('button', { name: `You are playing ${VIEWER_FACTION}` }, { timeout: 30_000 });
    await expect(finishTransitions(toast)).toBeVisible();
    const token = page.getByRole('button', { name: `Faction info, you are playing as ${VIEWER_FACTION}` });
    /* The capture shows the token after its pulse, not a moment of it. */
    token.getAnimations({ subtree: true }).forEach((animation) => animation.finish());
    await expect(token).toBeVisible();
  },
});
