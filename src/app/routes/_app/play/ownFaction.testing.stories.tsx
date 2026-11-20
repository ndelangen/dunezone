import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { windowNamed } from './controls.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { beforeTheDeal, dealFactions, tradeWithSeatOne, VIEWER_FACTION } from './ownFaction.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';
import { holdNotices } from './softNotices.stories.fixture';

/* What the viewer's own faction cues open, and when they come (#2987). */
const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Own faction',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
  decorators: [...gameMeta.decorators, holdNotices],
  beforeEach: beforeTheDeal(),
});

const WAIT = { timeout: 30_000 };

/* Faction info, open on the viewer's own faction. */
async function expectOwnFactionInfo(page: ReturnType<typeof within>) {
  await waitFor(() => expect(windowNamed(page, 'Faction info')).not.toBeNull(), WAIT);
  const picker = within(within(windowNamed(page, 'Faction info')!).getByRole('group', { name: 'Factions' }));
  await expect(picker.getByRole('button', { name: `You, ${VIEWER_FACTION}` })).toHaveAttribute('aria-pressed', 'true');
}

/* Clicking the toast opens Faction info on the viewer's own faction, and the toast goes. */
export const ToastOpensOwnFactionInfo = meta.story({
  play: async ({ canvasElement }) => {
    const page = await dealFactions(canvasElement);
    const name = `You are playing ${VIEWER_FACTION}`;
    await userEvent.click(await page.findByRole('button', { name }, WAIT));
    await expectOwnFactionInfo(page);
    await expect(page.queryByRole('button', { name })).toBeNull();
  },
});

/* Before the viewer holds a hand, their token in the bottom bar opens their Faction info. */
export const DockTokenOpensOwnFactionInfo = meta.story({
  play: async ({ canvasElement }) => {
    const page = await dealFactions(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: `Faction info, you are playing as ${VIEWER_FACTION}` }, WAIT)
    );
    await expectOwnFactionInfo(page);
  },
});

/* A trade hands the viewer another faction, and the toast says so again. */
export const TradeTellsAgain = meta.story({
  play: async ({ canvasElement }) => {
    const page = await dealFactions(canvasElement);
    await page.findByRole('button', { name: `You are playing ${VIEWER_FACTION}` }, WAIT);
    const traded = tradeWithSeatOne();
    await expect(page.findByRole('button', { name: `You are playing ${traded}` }, WAIT)).resolves.toBeVisible();
  },
});

/* With motion off the token appears in the bar without pulsing. */
export const TokenStillWithoutMotion = meta.story({
  globals: { motion: 'reduce' },
  play: async ({ canvasElement }) => {
    const page = await dealFactions(canvasElement);
    const token = await page.findByRole('button', { name: /^Faction info, you are playing as/ }, WAIT);
    await expect(getComputedStyle(token).animationName).toBe('none');
  },
});

/* A spectator is dealt nothing: no toast and no token of their own. */
export const SpectatorIsToldNothing = meta.story({
  beforeEach: beforeTheDeal('neutral'),
  play: async ({ canvasElement }) => {
    const page = await dealFactions(canvasElement);
    await page.findByRole('group', { name: 'Factions' }, WAIT).catch(() => undefined);
    await expect(page.queryByRole('button', { name: /^You are playing/ })).toBeNull();
    await expect(page.queryByRole('button', { name: /you are playing as/ })).toBeNull();
  },
});

/* A table already in play is not news: opening it raises no toast, and the token opens the hand as before. */
export const NoToastOncePlaying = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: /^Hand & spice, you are playing as/ }, WAIT)).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: /^You are playing/ })).toBeNull();
  },
});
