import { db, faction, ref, STORYBOOK_NOW, storybookViewer } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { SIX, factions, productDatabase } from './product.stories.fixture';

const RULESET_KEY = 'ruleset:classicrules';
/* The summary stores user ids as strings; the seed resolver still replaces a nested reference. */
const userRef = (key: string) => ref(key) as unknown as string;

type Directory = NonNullable<StorybookDatabase['play_games'][number]['directory']>;
const MINUTE = 60_000;

/*
 * A room of six tables: two of the viewer's, two with free seats (one drafting, one under way), a full table trading factions and one finished.
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
    name: [
      'Arrakeen picnic',
      'Midnight Caladan tea break',
      'Gom Jabbar party',
      'Annual Bene Gesserit wedding traitor',
      'Giedi Prime dinner ambush',
      'Secret Shai-Hulud dance rehearsal',
    ][sequence - 1],
    slug: `lobby-game-${sequence}`,
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

export const signedIn = {
  identity: { ...storybookViewer, sessionKey: 'lobby-session' },
  database: db(lobbyDatabase),
};
