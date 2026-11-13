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

/**
 * Moves a page asked for at an address that only leads to its record, such as a faction's own address leading to its default variant (#2909), to the record's own one.
 * The redirect is temporary, since what such an address leads to can change.
 */
export function redirectToOwnAddress(
  requested: string,
  own: string,
  pathname: string,
  location: Pick<ParsedLocation, 'searchStr' | 'hash'>
): void {
  if (requested !== own) {
    throw redirect({
      href: pathname + location.searchStr + (location.hash ? '#' + encodeURI(location.hash) : ''),
      statusCode: 302,
    });
  }
}
