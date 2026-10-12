import { v } from 'convex/values';

import { playStageSchema } from '../src/shared/play/admission';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import { isIsolatedLoopbackBackend } from './lib/isolatedBackend';
import { insertPendingGame } from './lib/playProvisioningSchedule';

function requireLoopback() {
  if (!isIsolatedLoopbackBackend()) {
    throw new Error('The game-name proof requires an isolated loopback backend');
  }
}

/** Legacy shapes exist only on a disposable backend, never on the hosted directory. */
export const seedLegacyDirectory = internalMutation({
  args: {},
  returns: v.object({ missing: v.array(v.id('play_games')), retained: v.id('play_games') }),
  handler: async (ctx) => {
    requireLoopback();
    const ids = [];
    for (const directory_stage of playStageSchema.options) {
      ids.push(
        await ctx.db.insert('play_games', {
          name: 'Arrakeen legacy picnic',
          directory_stage,
          state: 'ready',
          secret: 'synthetic-legacy-secret',
          attempt_id: 'synthetic-legacy-attempt',
          created_at: 1,
          provision_expires_at: 1,
        })
      );
    }
    for (const state of ['pending', 'expired'] as const) {
      ids.push(
        await ctx.db.insert('play_games', {
          state,
          fixture_key: 'retired-name-proof',
          ...(state === 'expired' ? { slug: 'retained-legacy-link' } : {}),
          secret: 'synthetic-legacy-secret',
          attempt_id: 'synthetic-legacy-attempt',
          created_at: 1,
          provision_expires_at: 1,
        })
      );
    }
    return { missing: ids.slice(0, -1), retained: ids[ids.length - 1]! };
  },
});

/** Eight independent active sessions exercise real transaction conflicts without spending shared quotas. */
export const seed = internalMutation({
  args: {},
  returns: v.object({ subjects: v.array(v.string()), absentGameId: v.id('play_games') }),
  handler: async (ctx) => {
    requireLoopback();
    const subjects = [];
    for (let index = 0; index < 8; index += 1) {
      const userId = await ctx.db.insert('users', { name: `Address proof ${index}`, account_state: 'active' });
      const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
      await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
      subjects.push(`${userId}|${sessionId}`);
    }
    const absent = await insertPendingGame(ctx, { fixture_key: 'address-proof' });
    await ctx.db.delete('play_games', absent.gameId);
    return { subjects, absentGameId: absent.gameId };
  },
});

/** The proof exposes only bounded name/address data, never provisioning credentials. */
export const inspect = internalQuery({
  args: { gameIds: v.array(v.id('play_games')) },
  returns: v.array(
    v.object({
      id: v.id('play_games'),
      name: v.optional(v.string()),
      slug: v.optional(v.string()),
      legacyToken: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    requireLoopback();
    if (args.gameIds.length > 32) {
      throw new Error('The address proof reads at most 32 games');
    }
    const games = [];
    for (const id of args.gameIds) {
      const game = await ctx.db.get('play_games', id);
      games.push({
        id,
        name: game?.name,
        slug: game?.slug,
        legacyToken: ctx.db.normalizeId('play_games', id) !== null,
      });
    }
    return games;
  },
});
