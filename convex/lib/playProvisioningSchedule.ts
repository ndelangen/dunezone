import { PLAY_PROVISION_TIMEOUT_MS } from '../../src/shared/play/admission';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { playCredential } from './playAuthorization';

type PendingGameFields = Pick<
  Doc<'play_games'>,
  'fixture_key' | 'load_profile' | 'ruleset_id' | 'minimum_players' | 'creator_id'
>;

/**
 * One pending game record with fresh server-only credentials, and the provisioning requests and expiry that drive it, whether the record is a fixture or a real game.
 * The retries reuse the same attempt;
 * the expiry marks an unconfirmed attempt without touching a confirmed game.
 */
export async function createPendingGame(ctx: MutationCtx, fields: PendingGameFields): Promise<Id<'play_games'>> {
  const expiresAt = Date.now() + PLAY_PROVISION_TIMEOUT_MS;
  const gameId = await ctx.db.insert('play_games', {
    ...fields,
    state: 'pending',
    secret: playCredential(),
    attempt_id: playCredential(),
    provision_expires_at: expiresAt,
    created_at: Date.now(),
  });
  for (const delay of [0, 10_000, 20_000, 40_000]) {
    await ctx.scheduler.runAfter(delay, internal.playProvisioning.requestProvision, { gameId });
  }
  await ctx.scheduler.runAt(expiresAt, internal.playProvisioning.expireProvisioning, { gameId });
  return gameId;
}
