import { useLayoutEffect } from 'react';

import { startArtworkLoad } from './artworkLoads';

/**
 * A suspense fallback that counts as one unsettled artwork load for as long as it is shown.
 * Textures that load by suspending, such as the board map, are then counted like the table's other artwork.
 * It counts from the commit that shows it, so no frame reads zero between the scene's mount and its first load.
 */
export function ArtworkPending() {
  useLayoutEffect(() => startArtworkLoad(), []);
  return null;
}
