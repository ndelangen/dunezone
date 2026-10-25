import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db, ref, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { signedIn } from './index.stories.fixture';
import { SIX, factions, productDatabase } from './product.stories.fixture';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Lobby',
  args: { path: '/play' },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Play Dune!', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(
      page.findByText('Ongoing and past games appear here once you sign in.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Learn to play' })).toHaveAttribute('href', '/tutorial');
    await expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
    await expect(page.queryByRole('link', { name: /demo/i })).toBeNull();
  },
});

/**
 * A signed-in player sees every game as a table: faces round it, faction tokens on the faces once assigned, and Open on every card.
 * Their own games lead.
 * The toolbar narrows to theirs or to finished games and searches by game or player.
 */
export const SignedIn = meta.story({
  parameters: signedIn,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const games = await page.findByRole('list', { name: 'Games' }, { timeout: 30_000 });
    await expect(within(games).getAllByRole('listitem')).toHaveLength(5);
    await expect(within(games).getAllByRole('link', { name: /^Open / })).toHaveLength(5);
    await expect(page.getAllByText('Your seat')).toHaveLength(2);
    await expect(page.getAllByText('Seats open')).toHaveLength(2);
    await expect(page.getByRole('img', { name: `${SIX[1]!.name} (you), ${factions[1]!.data.name}` })).toBeVisible();
    /* Create stands in the header and as the toolbar's plus, as on the faction catalogue, never repeated in the list. */
    await expect(page.getAllByRole('link', { name: 'Create a game' })).toHaveLength(2);
    await expect(within(games).queryByRole('link', { name: 'Create a game' })).toBeNull();
  },
});

/** Before any game exists the room is empty and the header's call to action is the way in. */
export const NoGames = meta.story({
  parameters: {
    identity: signedIn.identity,
    database: db((baseline) => {
      productDatabase(baseline);
      baseline.authSessions.push({
        $key: 'lobby-session',
        userId: ref(storybookViewer.subjectKey),
        expirationTime: 4_102_444_800_000,
      });
      baseline.authRefreshTokens.push({ sessionId: ref('lobby-session'), expirationTime: 4_102_444_800_000 });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'No games yet' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Create a game' })).toBeVisible();
  },
});
