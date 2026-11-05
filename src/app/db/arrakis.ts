import { useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

/**
 * The saved Arrakis board's published face, live: its id, image and territories.
 * `undefined` while it loads;
 * `null` when the site has none, or it has not been published with its territories yet.
 */
export function useArrakisFace() {
  return useLiveQuery(api.arrakis.face, {});
}
