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
    throw redirect({ href: withLocation(pathname + suffix, location), statusCode: 301 });
  }
}

/**
 * Moves a faction page asked for at an address that only leads to its variant, such as the faction's own address leading to its default variant (#2909), to the variant's own one.
 * The redirect is temporary, since what such an address leads to can change.
 */
export function redirectToOwnFactionAddress(
  requested: string,
  ownSlug: string,
  location: Pick<ParsedLocation, 'searchStr' | 'hash'>,
  suffix = ''
): void {
  if (requested !== ownSlug) {
    throw redirect({
      href: withLocation(`/factions/${encodeURIComponent(ownSlug)}${suffix}`, location),
      statusCode: 302,
    });
  }
}

function withLocation(pathname: string, location: Pick<ParsedLocation, 'searchStr' | 'hash'>) {
  return pathname + location.searchStr + (location.hash ? '#' + encodeURI(location.hash) : '');
}
