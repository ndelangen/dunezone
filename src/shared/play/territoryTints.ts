import { z } from 'zod';

import { TERRITORY_NAME_LIMIT } from '../boards/schema';
import { actionKindGuard } from './actionKinds';
import { GameRejection } from './rejection';
import { tableIdSchema as id } from './schema';

/** The colours a tint can take, in the order the panel offers them. */
export const TINT_COLORS = ['#2f7fe0', '#d63a2a', '#3fae4a', '#9450d0', '#f2f2f2', '#1b1b1b'] as const;
export const TINT_COLOR_NAMES: Record<(typeof TINT_COLORS)[number], string> = {
  '#2f7fe0': 'Blue',
  '#d63a2a': 'Red',
  '#3fae4a': 'Green',
  '#9450d0': 'Purple',
  '#f2f2f2': 'White',
  '#1b1b1b': 'Black',
};
/** Artwork a tint may stamp on each of its territories. */
export const TINT_STAMPS = ['atomics'] as const;
export const MAX_TINTS = 12;
/* Far more than any board's territories; bounds what one tint stores and resends. */
const MAX_TINT_TERRITORIES = 128;

/* A territory is named by the ID its board derives from its name, so it reads the same on every board copy. */
const territorySchema = z
  .string()
  .regex(/^[a-z0-9_]+$/)
  .max(128);
const nameSchema = z.string().trim().min(1).max(48);
const colorSchema = z.enum(TINT_COLORS);

const tintSchema = z.strictObject({
  id,
  name: nameSchema,
  color: colorSchema,
  stamp: z.enum(TINT_STAMPS).optional(),
  territories: z.array(territorySchema).max(MAX_TINT_TERRITORIES),
});
export type TerritoryTint = z.infer<typeof tintSchema>;
/** Shared tints over territories, oldest first, so a later tint paints over an earlier one. */
export const territoryTintsSchema = z.array(tintSchema).max(MAX_TINTS);

export const territoryTintActionSchema = z.discriminatedUnion('kind', [
  /* The page names a new tint, so the player can start painting it before the table answers. */
  z.strictObject({
    kind: z.literal('tint-create'),
    tintId: id,
    name: nameSchema,
    color: colorSchema,
    stamp: z.enum(TINT_STAMPS).optional(),
    territories: z.array(territorySchema).max(MAX_TINT_TERRITORIES),
  }),
  /*
   * Puts the territory in the tint or takes it out, as the page saw it when clicked, so two players painting the same territory at once agree.
   * The name is only for the log, as long as a board allows.
   */
  z.strictObject({
    kind: z.literal('tint-paint'),
    tintId: id,
    territory: territorySchema,
    name: z.string().trim().min(1).max(TERRITORY_NAME_LIMIT),
    painted: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('tint-remove'), tintId: id }),
]);
export type TerritoryTintAction = z.infer<typeof territoryTintActionSchema>;
export const isTerritoryTintAction = actionKindGuard(territoryTintActionSchema);

type Applied = { tints: TerritoryTint[]; message: string };

function createTint(
  tints: readonly TerritoryTint[],
  action: Extract<TerritoryTintAction, { kind: 'tint-create' }>
): Applied {
  if (tints.some((tint) => tint.id === action.tintId)) {
    throw new GameRejection('That tint is already on the table.');
  }
  if (tints.length >= MAX_TINTS) {
    throw new GameRejection(`The table holds at most ${MAX_TINTS} tints. Remove one first.`);
  }
  const { tintId, kind: _kind, territories, ...rest } = action;
  const tint: TerritoryTint = { id: tintId, ...rest, territories: [...new Set(territories)] };
  return { tints: [...tints, tint], message: `New tint: ${tint.name}.` };
}

function paintTint(
  tints: readonly TerritoryTint[],
  tint: TerritoryTint,
  action: Extract<TerritoryTintAction, { kind: 'tint-paint' }>
): Applied {
  const { territory, name, painted } = action;
  if (tint.territories.includes(territory) === painted) {
    throw new GameRejection(painted ? `${name} is already in ${tint.name}.` : `${name} is not in ${tint.name}.`);
  }
  if (painted && tint.territories.length >= MAX_TINT_TERRITORIES) {
    throw new GameRejection(`A tint covers at most ${MAX_TINT_TERRITORIES} territories.`);
  }
  const territories = painted ? [...tint.territories, territory] : tint.territories.filter((id) => id !== territory);
  return {
    tints: tints.map((candidate) => (candidate === tint ? { ...tint, territories } : candidate)),
    message: painted ? `Added ${name} to ${tint.name}.` : `Took ${name} out of ${tint.name}.`,
  };
}

/** The tints after an action, and the line the table logs for it; a refused action throws the reason. */
export function applyTerritoryTint(tints: readonly TerritoryTint[], action: TerritoryTintAction): Applied {
  if (action.kind === 'tint-create') {
    return createTint(tints, action);
  }
  const tint = tints.find((candidate) => candidate.id === action.tintId);
  if (!tint) {
    throw new GameRejection('That tint is no longer on the table.');
  }
  if (action.kind === 'tint-remove') {
    return { tints: tints.filter((candidate) => candidate !== tint), message: `Removed tint: ${tint.name}.` };
  }
  return paintTint(tints, tint, action);
}
