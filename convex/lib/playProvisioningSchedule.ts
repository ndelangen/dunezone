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
 * One pending game record with fresh server-only credentials and its expiry, whether the record is a fixture or a real game.
 * The expiry marks an unconfirmed attempt without touching a confirmed game.
 * It schedules no provisioning request, so a caller that provisions the game itself, as the test control does, sends the only one.
 */
export async function insertPendingGame(ctx: MutationCtx, fields: PendingGameFields) {
  const secret = playCredential();
  const attemptId = playCredential();
  const expiresAt = Date.now() + PLAY_PROVISION_TIMEOUT_MS;
  const gameId = await ctx.db.insert('play_games', {
    ...fields,
    state: 'pending',
    secret,
    attempt_id: attemptId,
    provision_expires_at: expiresAt,
    created_at: Date.now(),
  });
  await ctx.scheduler.runAt(expiresAt, internal.playProvisioning.expireProvisioning, { gameId });
  return { gameId, secret, attemptId, expiresAt };
}

/**
 * A pending game and the provisioning requests that drive it.
 * The retries reuse the same attempt.
 */
export async function createPendingGame(ctx: MutationCtx, fields: PendingGameFields): Promise<Id<'play_games'>> {
  const { gameId } = await insertPendingGame(ctx, fields);
  for (const delay of [0, 10_000, 20_000, 40_000]) {
    await ctx.scheduler.runAfter(delay, internal.playProvisioning.requestProvision, { gameId });
  }
  return gameId;
}
