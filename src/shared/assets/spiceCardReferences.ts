import type { z } from 'zod';

import { compareCodeUnits } from '../compareText';
import type { SpiceBoardLink } from './schema';

/** Map placements and the fixed type slot share one resolved token front per asset. */
export function spiceBoardTokenIds(link: z.infer<typeof SpiceBoardLink> | undefined): string[] {
  return link
    ? [
        ...new Set([
          ...link.tokens.map((token) => token.asset_id),
          ...(link.typeToken ? [link.typeToken.asset_id] : []),
        ]),
      ].sort(compareCodeUnits)
    : [];
}
