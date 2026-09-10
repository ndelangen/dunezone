import { z } from 'zod';

import { componentGeometrySchema } from '../asset-publishing/componentGeometry';
import arrakis from './boards/arrakis.json';

/** Feature geometry and the image address share one maintained board revision. */
const boardDefinitionSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().max(120),
  revision: z.string().regex(/^[0-9a-f]{64}$/),
  imageUrl: z.string().regex(/^\/page\/arrakis-[0-9a-f]{64}\.svg$/),
  geometry: componentGeometrySchema,
});

export const RULEBOOK_BOARD_DEFINITIONS = [boardDefinitionSchema.parse(arrakis)];

export function resolveRulebookBoardDefinition(id: string) {
  return RULEBOOK_BOARD_DEFINITIONS.find((board) => board.id === id);
}
