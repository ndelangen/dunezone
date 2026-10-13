import type { FunctionArgs } from 'convex/server';

import { db } from '@db/core';

import { api } from '../../../convex/_generated/api';

/** A public detail page's address, as its route params name it. */
export type FormerAddress = FunctionArgs<typeof api.formerAddresses.resolve>['address'];

/**
 * Where the record a rename moved away from `address` lives now, or null.
 * Any failure reads as null, including a backend deployed before this query existed, so the lookup can only ever leave a missing page at its 404.
 */
export async function loadCurrentAddress(address: FormerAddress): Promise<string | null> {
  try {
    return await db.query(api.formerAddresses.resolve, { address });
  } catch {
    return null;
  }
}
