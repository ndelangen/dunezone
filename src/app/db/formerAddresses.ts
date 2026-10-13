import type { FunctionArgs } from 'convex/server';

import { db } from '@db/core';

import { api } from '../../../convex/_generated/api';

/** A public detail page's address, as its route params name it. */
export type FormerAddress = FunctionArgs<typeof api.formerAddresses.resolve>['address'];

/**
 * Where the record a rename moved away from `address` lives now, or null.
 * A backend deployed before this query existed reads as null, so the page keeps its 404.
 * Every other failure stays an error, as a page query's own does, so an outage never tells crawlers a page is gone.
 */
export async function loadCurrentAddress(address: FormerAddress): Promise<string | null> {
  try {
    return await db.query(api.formerAddresses.resolve, { address });
  } catch (error) {
    if (error instanceof Error && /Could not find public function/.test(error.message)) {
      return null;
    }
    throw error;
  }
}
