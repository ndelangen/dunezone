import type { z } from 'zod';

import type { CustomCardTokens, CustomCardLayer } from '../schema';
import { publishingRectangleTokenFace } from './publishingRectangleTokenFace';
import { publishingTokenFace } from './publishingTokenFace';

/** Four linked shapes in one print composition, including a token with authored text. */
export const publishingCustomCardTokens: z.infer<typeof CustomCardTokens> = {
  'disc-token': { type: 'token-disc', name: 'Karama disc', face: publishingTokenFace },
  'tech-token': { type: 'token-tech', name: 'Karama tech', face: publishingTokenFace },
  'plate-token': { type: 'token-plate', name: 'Karama plate', face: publishingTokenFace },
  'enhance-token': { type: 'token-enhance', name: 'Kwisatz enhance', face: publishingRectangleTokenFace },
};

export const publishingCustomCardTokenLayers: z.infer<typeof CustomCardLayer>[] = Object.keys(
  publishingCustomCardTokens
).map((asset_id, index) => ({
  kind: 'token',
  layerId: `30000000-3000-4000-8000-30000000000${index + 1}`,
  asset_id,
  offset: [index % 2 === 0 ? -220 : 180, index < 2 ? -80 : 350],
  scale: 0.9,
  opacity: 1,
  rotation: index % 2 === 0 ? -8 : 8,
}));
