import { z } from 'zod';

import { withSupportNames } from '../factions/schema';
import type { AuthoredFace, AuthoredTroop } from '../factions/troopCombat';
import { troopCombatFaces } from '../factions/troopCombat';
import {
  storedPieceSchema,
  tableCountSchema as count,
  tableIdSchema as id,
  tablePieceSchema,
  tablePositionSchema,
} from './schema';

export const BATTLE_COUNTDOWN_MS = 5000;
const battleSideSchema = z.union([z.literal(0), z.literal(1)]);
const battleOutcomeSchema = z.enum(['left', 'none', 'right']);
/**
 * A game stores its combat faces and plans, so faces stored before the funded-to-supported rename still carry the old names;
 * the read renames them, and every write carries only the new ones.
 */
export const combatFaceSchema = z.preprocess(
  withSupportNames,
  z.object({
    id,
    name: z.string(),
    capable: z.boolean().default(true),
    strength: z.number(),
    supportedStrength: z.number(),
    supportCost: count.default(1),
    image: z.string().optional(),
  })
);
export type CombatFace = z.infer<typeof combatFaceSchema>;
const troopDeclarationSchema = z.strictObject({ faceId: id, undialed: count, dialed: count });
const battlePlanInputSchema = z.strictObject({
  mode: z.enum(['max', 'custom']),
  troops: z.array(troopDeclarationSchema),
  spice: count,
  adjustment: z.number(),
  leaderId: id.nullable(),
  cardIds: z.array(id),
});
export const battlePlanSchema = battlePlanInputSchema.extend({
  strength: z.number(),
  pieces: z.array(tablePieceSchema),
  faces: z.array(combatFaceSchema),
});
export const storedBattlePlanSchema = battlePlanSchema.extend({ pieces: z.array(storedPieceSchema) });
export type BattlePlanInput = z.infer<typeof battlePlanInputSchema>;
export type BattlePlan = z.infer<typeof battlePlanSchema>;
export type StoredBattlePlan = z.infer<typeof storedBattlePlanSchema>;
const publicSideSchema = z.object({ factionId: id, ready: z.boolean(), choice: battleOutcomeSchema.nullable() });
const battleBase = {
  id,
  anchor: tablePositionSchema,
  territory: z.string(),
  stage: z.enum(['preparing', 'countdown', 'revealed']),
  sides: z.tuple([publicSideSchema.nullable(), publicSideSchema.nullable()]),
  deadline: count.nullable(),
};
export const publicBattleSchema = z.object({
  ...battleBase,
  revealed: z.tuple([battlePlanSchema, battlePlanSchema]).optional(),
});
export const battleResultSchema = z.object({
  id,
  anchor: tablePositionSchema,
  territory: z.string(),
  factions: z.tuple([id, id]),
  plans: z.tuple([battlePlanSchema, battlePlanSchema]),
  outcome: battleOutcomeSchema,
  revision: count,
});
export const storedBattleResultSchema = battleResultSchema.extend({
  plans: z.tuple([storedBattlePlanSchema, storedBattlePlanSchema]),
});
export type PublicBattle = z.infer<typeof publicBattleSchema>;
export const battleActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('battle-start'),
    anchor: tablePositionSchema,
    territory: z.string().min(1).max(160),
  }),
  z.strictObject({ kind: z.literal('battle-claim'), battleId: id, side: battleSideSchema }),
  z.strictObject({ kind: z.literal('battle-plan'), battleId: id, plan: battlePlanInputSchema }),
  z.strictObject({ kind: z.literal('battle-ready'), battleId: id, ready: z.boolean() }),
  z.strictObject({ kind: z.literal('battle-cancel'), battleId: id }),
  z.strictObject({ kind: z.literal('battle-outcome'), battleId: id, outcome: battleOutcomeSchema }),
  z.strictObject({ kind: z.literal('hand-take'), pieceId: id }),
  z.strictObject({ kind: z.literal('hand-play'), pieceId: id, position: tablePositionSchema }),
]);
export type BattleAction = z.infer<typeof battleActionSchema>;
const kinds: ReadonlySet<string> = new Set(battleActionSchema.options.map((option) => option.shape.kind.value));
export function isBattleAction(action: { kind: string }): action is BattleAction {
  return kinds.has(action.kind);
}

/** The hosted fixture's houses have no catalogue definition; a real game reads its captured faction's faces instead. */
export function fixtureCombatFaces(factionId: string): CombatFace[] {
  return [
    {
      id: `${factionId}-front`,
      name: 'Troops',
      capable: true,
      strength: 0.5,
      supportedStrength: 1,
      supportCost: 1,
      image: `/vector/troop/${factionId}.svg`,
    },
  ];
}

type CapturedFace = AuthoredFace & { image: string };

/**
 * The combat faces a captured faction definition supplies to its battle plans: every face that can fight and has authored values.
 * A noncombatant face has no section, and a face missing its values stays out rather than borrowing any, which the capture's verdict names.
 */
export function capturedCombatFaces(troops: readonly AuthoredTroop<CapturedFace>[]): CombatFace[] {
  return troopCombatFaces(troops).flatMap(({ id, face, capable, combat }) =>
    capable && combat ? [{ id, name: face.name, capable: true, ...combat, image: face.image }] : []
  );
}

export function emptyBattlePlan(faces: CombatFace[]): StoredBattlePlan {
  return {
    mode: 'max',
    troops: [],
    spice: 0,
    adjustment: 0,
    leaderId: null,
    cardIds: [],
    strength: 0,
    pieces: [],
    faces,
  };
}

/** Published disc tokens can be chosen as leaders; physical troop discs stay on the board. */
export function isBattleLeader(piece: z.infer<typeof tablePieceSchema>): boolean {
  return piece.kind === 'force' && piece.items.every((item) => item.artwork?.type === 'token-disc');
}
