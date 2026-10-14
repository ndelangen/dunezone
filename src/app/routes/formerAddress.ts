import type { ParsedLocation } from '@tanstack/react-router';
import { redirect } from '@tanstack/react-router';

import { loadCurrentAddress } from '@db/formerAddresses';
import type { FormerAddress } from '@db/formerAddresses';

/**
 * Throws a permanent redirect when a rename moved the record away from the address a loader found empty.
 * The query string and fragment travel along, and `suffix` names a page below the record's own.
 * Loaders call it only after their page query missed, and throw their 404 when it returns.
 */
export async function redirectFromFormerAddress(
  address: FormerAddress,
  location: Pick<ParsedLocation, 'searchStr' | 'hash'>,
  suffix = ''
): Promise<void> {
  const pathname = await loadCurrentAddress(address);
  if (pathname) {
    throw redirect({
      href: pathname + suffix + location.searchStr + (location.hash ? '#' + encodeURI(location.hash) : ''),
      statusCode: 301,
    });
  }
}
