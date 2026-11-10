import { vi } from 'vite-plus/test';

import type { PlaySendNudgeRequest } from '../src/shared/play/nudges';
import { api } from './_generated/api';
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
  const request = (overrides: Partial<PlaySendNudgeRequest> = {}): PlaySendNudgeRequest => ({
    gameId: world.gameId,
    secret: world.credentials.secret,
    fromSeat: 'seat-2',
    fromUserId: world.spectator.userId,
    fromFactionId: 'atreides',
    toSeat: 'seat-1',
    toUserId: world.identity.userId,
    ...overrides,
  });
  await world.publish(
    2,
    world.summary([world.identity.userId, world.spectator.userId], {
      seats: [
        {
          seat: 'seat-1',
          userId: world.identity.userId,
          faction: { id: 'harkonnen', name: 'Harkonnen', color: 'red' },
        },
        {
          seat: 'seat-2',
          userId: world.spectator.userId,
          faction: { id: 'atreides', name: 'Atreides', color: 'green' },
        },
      ],
    })
  );
  const publishNudge = (overrides: Partial<PlaySendNudgeRequest> = {}) =>
    world.t.action(api.playDiscordNudges.sendNudge, request(overrides));
  const rows = () => world.t.run((ctx) => ctx.db.query('play_game_discord_nudges').take(20));
  return { ...world, authAccountId, fetch, request, publishNudge, rows };
}
