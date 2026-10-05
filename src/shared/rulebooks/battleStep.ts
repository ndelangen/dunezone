import { z } from 'zod';

import { FactionTroopIdSchema } from '../factions/troopIdentity';
import { rulebookCardSourceReferenceSchema, rulebookSourceReferenceSchema } from './sources';

const troopCountSchema = z.number().int().min(0).max(100);

/** Each troop group keeps its identity when the faction roster is renamed or reordered. */
export const rulebookBattleTroopSchema = z.strictObject({
  id: z.string().min(1),
  troopId: FactionTroopIdSchema,
  face: z.enum(['front', 'back']),
  supported: troopCountSchema,
  unsupported: troopCountSchema,
  uncommitted: troopCountSchema,
});

/**
 * A teaching step stores the numbers visible at that moment, independent of later losses.
 * The dial is troop strength including the adjustment, matching the battle wheel.
 * Leader strength stays in the leader and the author's explanation, never in the dial.
 */
export const rulebookBattleSideSchema = z.strictObject({
  factionId: z.string().min(1).optional(),
  role: z.string(),
  revealed: z.boolean(),
  dial: z.number().min(0).max(200).multipleOf(0.5),
  spice: z.number().int().min(0).max(200),
  adjustment: z.number().min(-200).max(200).multipleOf(0.5).optional(),
  leader: rulebookSourceReferenceSchema.optional(),
  leaderKilled: z.boolean().optional(),
  cards: z.array(rulebookCardSourceReferenceSchema).max(4),
  knownCard: rulebookCardSourceReferenceSchema.optional(),
  result: z.string().optional(),
  troops: z
    .array(rulebookBattleTroopSchema)
    .max(16)
    .refine((troops) => new Set(troops.map(({ id }) => id)).size === troops.length, {
      message: 'Troop group IDs must be unique within a battle plan',
    }),
});
export type RulebookBattleSideValue = z.infer<typeof rulebookBattleSideSchema>;

export const rulebookBattleDialogueSchema = z
  .array(z.strictObject({ speaker: z.enum(['left', 'right']), text: z.string() }))
  .max(8);

export const rulebookBattleStepFields = {
  step: z.string(),
  title: z.string(),
  caption: z.string(),
  left: rulebookBattleSideSchema,
  right: rulebookBattleSideSchema,
  dialogue: rulebookBattleDialogueSchema.optional(),
  outcome: z.string().optional(),
  showSideLabels: z.boolean().optional(),
};
