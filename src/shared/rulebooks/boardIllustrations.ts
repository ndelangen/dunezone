import { z } from 'zod';

import arrakis from './boards/arrakis.illustration.json';

/** Only the delivery compositor needs the inline illustration bytes. */
const boardIllustrationSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  revision: z.string().regex(/^[0-9a-f]{64}$/),
  svg: z.string().max(200_000),
});

const illustrations = [boardIllustrationSchema.parse(arrakis)];

export function resolveRulebookBoardIllustration(id: string) {
  return illustrations.find((board) => board.id === id);
}
