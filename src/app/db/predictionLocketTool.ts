import { db } from '@db/core';

import { api } from '../../../convex/_generated/api';

/** The time now by Dune Zone's clock, in milliseconds since 1970: the time a prediction is locked at, which the phone cannot set. */
export async function readLockTime(): Promise<number> {
  return await db.mutation(api.predictionLocketTool.lockTime, {});
}
