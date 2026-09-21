import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db, ref, storybookViewer } from '@db/storybook';

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
      page.findByRole('heading', { name: 'Game lobby', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(
      page.findByText('Ongoing and past games appear here once you may enter them.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
    expect(page.queryByRole('link', { name: /demo/i })).toBeNull();
  },
});

/** An Administrator sees the directory: one game drafting with their seat, one finished with its result. */
export const Administrator = meta.story({
  parameters: {
    identity: { ...storybookViewer, sessionKey: 'lobby-session' },
    database: db((baseline) => {
      productDatabase(baseline);
      baseline.authSessions.push({
        $key: 'lobby-session',
        userId: ref(storybookViewer.subjectKey),
        expirationTime: 4_102_444_800_000,
      });
      baseline.authRefreshTokens.push({ sessionId: ref('lobby-session'), expirationTime: 4_102_444_800_000 });
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
        faction: {
          id: factions[index]!.slug,
          name: factions[index]!.data.name,
          color: factions[index]!.data.themeColor,
        },
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
            factionIds: ['house-atreides'],
            declaredBy: 'story-user',
            declaredAt: 1_789_913_600_000,
          },
        })
      );
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Ongoing' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.getByRole('link', { name: 'Dreamrules · Drafting · 6 of 6 seats · you hold a seat' })).toBeVisible();
    expect(
      page.getByRole('link', { name: 'Dreamrules · Finished · 6 of 6 seats · winner House Atreides · you hold a seat' })
    ).toBeVisible();
    expect(page.getByRole('link', { name: 'Create a game' })).toBeVisible();
  },
});
