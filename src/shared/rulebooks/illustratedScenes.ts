import { z } from 'zod';

import { FactionTroopIdSchema } from '../factions/troopIdentity';
import { rulebookBattleStepFields } from './battleStep';
import { rulebookSourceReferenceSchema } from './sources';

const coordinate = z.number().min(0).max(1);
const positiveCoordinate = z.number().gt(0).max(1);
const count = z.number().int().min(0).max(100);
const angle = z.number().min(-360).max(360);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color');
const id = z.string().min(1);

function identifiedItems<Item extends z.ZodType<{ id: string }>>(item: Item) {
  return z
    .array(item)
    .max(64)
    .refine((items) => new Set(items.map(({ id: itemId }) => itemId)).size === items.length, {
      message: 'Each item must have a unique ID within its collection',
    });
}

/** Angles run counterclockwise from the east edge of the board. */
export const rulebookBoardPlayerSchema = z.strictObject({
  id,
  factionId: z.string().min(1).optional(),
  angle,
});

const troopSelectionFields = {
  factionId: z.string().min(1).optional(),
  troopId: FactionTroopIdSchema.optional(),
  face: z.enum(['front', 'back']),
  count,
};

/** Positions, token size, and spacing use fractions of the complete board dimensions. */
export const rulebookBoardTroopSchema = z.strictObject({
  id,
  ...troopSelectionFields,
  x: coordinate,
  y: coordinate,
  columns: z.number().int().min(1).max(20),
  size: positiveCoordinate,
  gap: coordinate,
});

const rulebookBoardAnnotationSchema = z
  .strictObject({
    id,
    title: z.string(),
    text: z.string(),
    x: coordinate,
    y: coordinate,
    targetX: coordinate.optional(),
    targetY: coordinate.optional(),
    color: color.optional(),
  })
  .refine((annotation) => (annotation.targetX === undefined) === (annotation.targetY === undefined), {
    message: 'A connector needs both target coordinates',
  });
const rulebookBoardHighlightSchema = z.strictObject({
  territory: z.string().min(1),
  color,
  opacity: coordinate.optional(),
});

/** Routes illustrate an author-supplied path; they do not calculate legal movement. */
export const rulebookBoardRouteSchema = z
  .strictObject({
    id,
    label: z.string(),
    color: color.optional(),
    direction: z.enum(['forward', 'both', 'none']),
    showWaypoints: z.boolean().optional(),
    waypoints: z
      .array(
        z
          .strictObject({
            territory: z.string().min(1).optional(),
            position: z.strictObject({ x: coordinate, y: coordinate }).optional(),
          })
          .refine((point) => point.territory !== undefined || point.position !== undefined, {
            message: 'A waypoint needs a territory or position',
          })
      )
      .min(2)
      .max(64),
    blockedAfter: z.number().int().min(0).optional(),
  })
  .refine((route) => route.blockedAfter === undefined || route.blockedAfter < route.waypoints.length - 1, {
    message: 'A blocked segment must join two waypoints',
  });

export const rulebookBoardSceneSchema = z.strictObject({
  boardId: z.string().min(1),
  caption: z.string(),
  size: z.enum(['compact', 'fit-width']).optional(),
  routes: identifiedItems(rulebookBoardRouteSchema).optional(),
  viewport: z
    .strictObject({
      x: z.number().min(-1).max(2),
      y: z.number().min(-1).max(2),
      width: z.number().gt(0).max(3),
      height: z.number().gt(0).max(3),
    })
    .optional(),
  storm: z.strictObject({ angle }).optional(),
  players: identifiedItems(rulebookBoardPlayerSchema),
  troops: identifiedItems(rulebookBoardTroopSchema),
  highlights: z.array(rulebookBoardHighlightSchema).max(64),
  annotations: identifiedItems(rulebookBoardAnnotationSchema),
});
export type RulebookBoardSceneValue = z.infer<typeof rulebookBoardSceneSchema>;

export const rulebookMovementSourceSchema = z.strictObject({
  id,
  kind: z.literal('source'),
  source: rulebookSourceReferenceSchema.optional(),
  count,
  label: z.string().optional(),
});
export const rulebookMovementTroopSchema = z.strictObject({
  id,
  kind: z.literal('troops'),
  ...troopSelectionFields,
  label: z.string().optional(),
});
const rulebookMovementPieceSchema = z.discriminatedUnion('kind', [
  rulebookMovementSourceSchema,
  rulebookMovementTroopSchema,
]);
export const rulebookMovementGroupSchema = z.strictObject({
  label: z.string(),
  pieces: identifiedItems(rulebookMovementPieceSchema),
});
export const rulebookMovementNoteSchema = z.strictObject({
  id,
  label: z.string(),
  source: rulebookSourceReferenceSchema.optional(),
  count,
});
export const rulebookPieceTransferSchema = z.strictObject({
  left: rulebookMovementGroupSchema,
  right: rulebookMovementGroupSchema,
  direction: z.enum(['exchange', 'right', 'none']).optional(),
});
export const rulebookPieceMovementSchema = rulebookPieceTransferSchema.extend({
  step: z.string(),
  title: z.string(),
  caption: z.string(),
  outcome: z.string().optional(),
  board: rulebookBoardSceneSchema.optional(),
  notes: identifiedItems(rulebookMovementNoteSchema).optional(),
});
export type RulebookPieceMovementValue = z.infer<typeof rulebookPieceMovementSchema>;

export const rulebookBattleExampleSchema = z.strictObject(rulebookBattleStepFields);
export const rulebookBattleComparisonSchema = z.strictObject({
  examples: z.tuple([rulebookBattleExampleSchema, rulebookBattleExampleSchema]),
});
