import { makeFunctionReference } from 'convex/server';

import type { WorkerIdentity } from './protocol';
import type { ConvexStorybookWorkerClient } from './runtime';

const getGameByAddress = makeFunctionReference<'query', { address: string }, { gameId?: string } | null>(
  'playGameDirectory:getGameByAddress'
);
const provisioningRequest = makeFunctionReference<
  'query',
  { gameId: string },
  { gameId: string; secret: string; attemptId: string; expiresAt: number } | null
>('playProvisioning:provisioningRequest');
const confirmProvisioning = makeFunctionReference<
  'mutation',
  { gameId: string; secret: string; attemptId: string },
  { ok: boolean }
>('playProvisioning:confirmProvisioning');

/**
 * Stands in for the game Worker in a story: confirms the pending game at the first of `addresses` that names one, so its page moves on from preparing.
 * `identity` is the story's viewer, who may see the game at its address.
 * Returns false when no address names a game.
 */
export async function confirmStoryProvisioning(
  client: ConvexStorybookWorkerClient,
  identity: WorkerIdentity,
  addresses: readonly string[]
): Promise<boolean> {
  for (const address of addresses) {
    const access = await client.query(getGameByAddress, { address }, identity);
    if (!access?.gameId) {
      continue;
    }
    const request = await client.query(provisioningRequest, { gameId: access.gameId }, identity);
    if (request) {
      const { gameId, secret, attemptId } = request;
      await client.mutation(confirmProvisioning, { gameId, secret, attemptId }, identity);
    }
    return true;
  }
  return false;
}
