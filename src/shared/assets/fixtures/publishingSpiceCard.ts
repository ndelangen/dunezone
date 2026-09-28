import type { z } from 'zod';

import type { SpiceAsset } from '../schema';

/**
 * A production-shaped spice card for the publisher capture regression and the Play catalogue seeds.
 * Its body is left to the renderer, so the capture also exercises the sentence `SpiceCard` builds from the name and the amount.
 */
export const publishingSpiceCard: z.infer<typeof SpiceAsset> = {
  name: 'Arsunt',
  about: 'Six spice appear in Arsunt when this card is revealed.',
  subName: 'Spice blow',
  icon: 'spice',
  highlights: ['arsunt'],
  amount: 6,
};
