import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { convexNeverAnswers, db, faction, ref, STORYBOOK_NOW, storybookViewer } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { SIX, factions, productDatabase } from './product.stories.fixture';

const RULESET_KEY = 'ruleset:classicrules';
/* The summary stores user ids as strings; the seed resolver still replaces a nested reference. */
const userRef = (key: string) => ref(key) as unknown as string;

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
    expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
    expect(page.queryByRole('link', { name: /demo/i })).toBeNull();
  },
});

type Directory = NonNullable<StorybookDatabase['play_games'][number]['directory']>;
const MINUTE = 60_000;

/*
 * A room of six tables: two of the viewer's, one with free seats, two under way without them and one finished.
 * Every seat is a real profile with an avatar, and every assigned faction a catalogue row, so the seats show faces and tokens.
 */
function lobbyDatabase(baseline: StorybookDatabase) {
  productDatabase(baseline);
  baseline.authSessions.push({
    $key: 'lobby-session',
    userId: ref(storybookViewer.subjectKey),
    expirationTime: 4_102_444_800_000,
  });
  baseline.authRefreshTokens.push({ sessionId: ref('lobby-session'), expirationTime: 4_102_444_800_000 });
  for (const [index, player] of SIX.entries()) {
    if (index !== 1) {
      baseline.users.push({ $key: `player-${index}`, name: player.name });
      baseline.profiles.push({
        $key: `profile-${index}`,
        user_id: ref(`player-${index}`),
        username: player.name,
        slug: player.name.toLowerCase(),
        avatar_url: player.avatar,
        account_state: 'active',
        created_at: '2026-09-21T00:00:00Z',
        updated_at: '2026-09-21T00:00:00Z',
      });
    }
  }
  for (const entry of factions) {
    baseline.factions.push({ ...faction({ name: entry.data.name, data: entry.data }), $key: `lobby:${entry.slug}` });
  }
  const seat = (player: number, withFaction: number | null = null) => ({
    seat: `seat-${player + 1}`,
    userId: userRef(player === 1 ? storybookViewer.subjectKey : `player-${player}`),
    faction:
      withFaction === null
        ? null
        : {
            id: userRef(`lobby:${factions[withFaction]!.slug}`),
            name: factions[withFaction]!.data.name,
            color: factions[withFaction]!.data.themeColor,
          },
  });
  const all = [0, 1, 2, 3, 4, 5];
  const game = (key: string, sequence: number, directory: Directory) => ({
    $key: key,
    state: 'ready' as const,
    ruleset_id: ref(RULESET_KEY),
    minimum_players: 6 as const,
    creator_id: ref(storybookViewer.subjectKey),
    secret: 'story-only-secret',
    attempt_id: `story-attempt-${sequence}`,
    provision_expires_at: 4_102_444_800_000,
    created_at: 0,
    confirmed_at: 0,
    directory_sequence: sequence,
    directory_stage: directory.stage,
    directory,
  });
  const base = { phase: null, result: null } as const;
  baseline.play_games.push(
    game('game:play-yours', 1, {
      ...base,
      stage: 'play',
      seatCount: 6,
      seats: all.map((player) => seat(player, player)),
      phase: 3 * 9 + 6,
      lastActivityAt: STORYBOOK_NOW - 4 * MINUTE,
    }),
    game('game:drafting-yours', 2, {
      ...base,
      stage: 'drafting',
      seatCount: 6,
      seats: [1, 2, 4, 5].map((player) => seat(player)),
      lastActivityAt: STORYBOOK_NOW - 18 * MINUTE,
    }),
    game('game:drafting-open', 3, {
      ...base,
      stage: 'drafting',
      seatCount: 5,
      seats: [0, 3].map((player) => seat(player)),
      lastActivityAt: STORYBOOK_NOW - 7 * MINUTE,
    }),
    game('game:swapping', 4, {
      ...base,
      stage: 'swapping',
      seatCount: 4,
      seats: [0, 2, 3, 5].map((player, index) => seat(player, index + 2)),
      lastActivityAt: STORYBOOK_NOW - 35 * MINUTE,
    }),
    game('game:play-late', 5, {
      ...base,
      stage: 'play',
      seatCount: 6,
      seats: all.filter((player) => player !== 1).map((player) => seat(player, 5 - player)),
      phase: 7 * 9 + 2,
      lastActivityAt: STORYBOOK_NOW - 140 * MINUTE,
    }),
    game('game:finished', 6, {
      ...base,
      stage: 'finished',
      seatCount: 6,
      seats: all.map((player) => seat(player, player)),
      lastActivityAt: STORYBOOK_NOW - 26 * 60 * MINUTE,
      result: {
        kind: 'alliance',
        factions: [0, 3].map((index) => ({
          id: userRef(`lobby:${factions[index]!.slug}`),
          name: factions[index]!.data.name,
        })),
        declaredBy: 'story-user',
        declaredAt: STORYBOOK_NOW - 26 * 60 * MINUTE,
      },
    })
  );
}

const signedIn = {
  identity: { ...storybookViewer, sessionKey: 'lobby-session' },
  database: db(lobbyDatabase),
};

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
    expect(within(games).getAllByRole('listitem')).toHaveLength(5);
    expect(within(games).getAllByRole('link', { name: /^Open / })).toHaveLength(5);
    expect(page.getAllByText('Your seat')).toHaveLength(2);
    expect(page.getAllByText('Seats open')).toHaveLength(2);
    expect(page.getByText('2 tables have a free seat')).toBeVisible();
    expect(page.getByRole('img', { name: `${SIX[1]!.name} (you), ${factions[1]!.data.name}` })).toBeVisible();
    expect(page.getAllByRole('link', { name: 'Create a game' }).length).toBeGreaterThan(0);
  },
});

/** Finished games carry their result, with a crown on each winner's seat. */
export const Finished = meta.story({
  parameters: signedIn,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('list', { name: 'Games' }, { timeout: 30_000 });
    await userEvent.click(page.getAllByLabelText('Show games').at(-1)!);
    await userEvent.click(await page.findByRole('option', { name: /^Finished/ }));
    const games = page.getByRole('list', { name: 'Games' });
    expect(within(games).getAllByRole('listitem')).toHaveLength(1);
    expect(
      within(games).getByText(`${factions[0]!.data.name} and ${factions[3]!.data.name} won together`)
    ).toBeVisible();
    expect(within(games).getAllByRole('img', { name: /, a winner$/ })).toHaveLength(2);
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
    expect(page.getByRole('link', { name: 'Create a game' })).toBeVisible();
  },
});

/** A lobby whose server never answers says so after ten seconds and offers the way home. */
export const ServerUnreachable = meta.story({
  decorators: [convexNeverAnswers],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText("Can't reach the server. Retrying...", {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.getByRole('link', { name: 'Go back home' })).toHaveAttribute('href', '/');
    expect(page.queryByText('Loading games.')).toBeNull();
  },
});
