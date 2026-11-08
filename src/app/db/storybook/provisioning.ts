import { makeFunctionReference } from 'convex/server';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import { api } from '../../../../convex/_generated/api';
import type { internal } from '../../../../convex/_generated/api';
import type { WorkerIdentity } from './protocol';
import type { ConvexStorybookWorkerClient } from './runtime';

type ProvisioningRequest = typeof internal.playProvisioning.provisioningRequest;
/* The game Worker reads the pending attempt through an internal query; the story's worker serves it by name, typed from the server's own contract. */
const provisioningRequest = makeFunctionReference<
  'query',
  FunctionArgs<ProvisioningRequest>,
  FunctionReturnType<ProvisioningRequest>
>('playProvisioning:provisioningRequest');
const getGameByAddress = api.playGameDirectory.getGameByAddress;
const confirmProvisioning = api.playProvisioning.confirmProvisioning;

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
    if (!('gameId' in access)) {
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
