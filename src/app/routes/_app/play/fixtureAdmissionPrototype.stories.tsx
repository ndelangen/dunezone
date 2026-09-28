/*
 * PROTOTYPE, #1323. Throwaway, on prototype/1323-1323-fixture-admission, which never merges.
 *
 * What a signed-in player sees at the hosted fixture's address, /play/<fixture id>, once fixture admission closes.
 * The database holds the fixture row as production stores it (fixture_key hosted-demo, no ruleset, ready) beside two real games, so the lobby in C lists what a player would find there.
 * A: today, the table opens under the name "Hosted fixture", on the fixture's first snapshot with its two houses.
 * B: the directory answers the fixture as it answers an unknown id, so the page says the game is not available.
 * C: the address sends the player to the lobby, as #1459 does for /play/hosted.
 */
import preview from '@sb/preview';
import { PLAY_FIXTURE_KEY } from '@shared/play/admission';
import { initialSnapshot } from '@shared/play/commands';
import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect, within } from 'storybook/test';

import { db, ref, refText, SEED_REF_TOKEN, storybookViewer } from '@db/storybook';

import { gameMeta, install } from './game.stories.fixture';
import { factions, productDatabase, SIX } from './product.stories.fixture';
import { storyTransport } from './storyTransport';

const FIXTURE_KEY = 'game:hosted-fixture';
const RULESET_KEY = 'ruleset:classicrules';
/* The summary stores user ids as strings; the seed resolver still replaces a nested reference. */
const userRef = (key: string) => ref(key) as unknown as string;

/* The hosted fixture's first snapshot as its room serves it: the table's pieces and the two houses the fixture seats (workers/game/fixture.ts). */
const fixtureSnapshot = (): GameSnapshot => ({
  ...initialSnapshot(),
  roster: {
    seatCount: 6,
    seats: [
      { id: 'harkonnen', position: 0, faction: { id: 'harkonnen', name: 'Harkonnen', color: '#ed927c' } },
      { id: 'atreides', position: 1, faction: { id: 'atreides', name: 'Atreides', color: '#75d8a7' } },
    ],
  },
});

const database = db((baseline) => {
  productDatabase(baseline);
  baseline.authSessions.push({
    $key: 'fixture-session',
    userId: ref(storybookViewer.subjectKey),
    expirationTime: 4_102_444_800_000,
  });
  baseline.authRefreshTokens.push({ sessionId: ref('fixture-session'), expirationTime: 4_102_444_800_000 });
  baseline.play_games.push({
    $key: FIXTURE_KEY,
    fixture_key: PLAY_FIXTURE_KEY,
    state: 'ready',
    secret: 'story-only-secret',
    attempt_id: 'story-attempt-fixture',
    provision_expires_at: 4_102_444_800_000,
    created_at: 0,
    confirmed_at: 0,
  });
  const game = (key: string, sequence: number, directory: (typeof baseline.play_games)[number]['directory']) => ({
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
    directory_stage: directory?.stage,
    directory,
  });
  for (const [index, player] of SIX.entries()) {
    if (index === 1) {
      continue;
    }
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
  const seats = SIX.map((player, index) => ({
    seat: player.seat,
    userId: userRef(index === 1 ? storybookViewer.subjectKey : `player-${index}`),
    faction: { id: factions[index]!.slug, name: factions[index]!.data.name, color: factions[index]!.data.themeColor },
  }));
  baseline.play_games.push(
    game('game:drafting', 3, {
      stage: 'drafting',
      seatCount: 6,
      seats: seats.map((seat) => ({ ...seat, faction: null })),
      phase: null,
      lastActivityAt: 1_790_000_000_000,
      result: null,
    }),
    game('game:finished', 9, {
      stage: 'finished',
      seatCount: 6,
      seats,
      phase: null,
      lastActivityAt: 1_789_913_600_000,
      result: {
        kind: 'faction',
        factions: [{ id: 'house-atreides', name: 'House Atreides' }],
        declaredBy: 'story-user',
        declaredAt: 1_789_913_600_000,
      },
    })
  );
});

const fixturePath = (variant: 'a' | 'b' | 'c') => refText(FIXTURE_KEY, `/play/${SEED_REF_TOKEN}?variant=${variant}`);

const meta = preview.meta({
  ...gameMeta,
  title: 'Prototype 1323 1323-fixture-admission',
  parameters: {
    ...gameMeta.parameters,
    identity: { ...storybookViewer, sessionKey: 'fixture-session' },
    database,
  },
});

export const AOpensTheTable = meta.story({
  args: { path: fixturePath('a') },
  beforeEach: install(() => storyTransport(SPECTATOR_SEAT, fixtureSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Hosted fixture', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('group', { name: 'Table view' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

export const BNotAvailable = meta.story({
  args: { path: fixturePath('b') },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('This game is not available', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.getByRole('link', { name: 'Back to lobby' })).toHaveAttribute('href', '/play');
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
  },
});

export const CLandsInTheLobby = meta.story({
  args: { path: fixturePath('c') },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Game lobby', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('heading', { name: 'Ongoing' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByText(/Hosted fixture/)).toBeNull();
  },
});
