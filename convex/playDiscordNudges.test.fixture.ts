import { vi } from 'vite-plus/test';

import type { PlayPublishNudgeRequest } from '../src/shared/play/nudges';
import { api, internal } from './_generated/api';
import { discordStub, voiceWorld } from './playDiscord.test.fixture';

export async function nudgeWorld() {
  discordStub();
  const world = await voiceWorld();
  await world.reconcile();
  const authAccountId = await world.t.run((ctx) =>
    ctx.db.insert('authAccounts', {
      userId: world.identity.userId,
      provider: 'discord',
      providerAccountId: '123456789',
    })
  );
  const fetch = vi.fn(async (_url: string, _options?: RequestInit) => Response.json({ id: '987654321' }));
  vi.stubGlobal('fetch', fetch);
  const request = (overrides: Partial<PlayPublishNudgeRequest> = {}): PlayPublishNudgeRequest => ({
    gameId: world.gameId,
    secret: world.credentials.secret,
    nudgeId: 'first-nudge',
    fromFactionId: 'atreides',
    fromFactionName: 'Atreides',
    toSeat: 'seat-1',
    toUserId: world.identity.userId,
    at: Date.now(),
    ...overrides,
  });
  const publishNudge = (overrides: Partial<PlayPublishNudgeRequest> = {}) =>
    world.t.mutation(api.playDiscordNudges.publishNudge, request(overrides));
  const rows = () => world.t.run((ctx) => ctx.db.query('play_game_discord_nudges').take(20));
  const delivery = async () => {
    const row = (await rows())[0];
    if (!row) {
      throw new Error('Expected an admitted nudge');
    }
    return { id: row._id, nudgeId: row.nudge_id };
  };
  const deliver = async () => world.t.action(internal.playDiscordNudgeActions.deliver, await delivery());
  return { ...world, authAccountId, fetch, request, publishNudge, rows, delivery, deliver };
}
