import { z } from 'zod';

import { TERRITORY_NAME_LIMIT } from '../boards/schema';
import { actionKindGuard } from './actionKinds';
import { CLIENT_MESSAGE_LIMIT } from './messageLimit';
import { GameRejection } from './rejection';
import { tableIdSchema as id } from './schema';

/** The colours a tint can take, in the order the panel offers them. */
export const TINT_COLORS = ['#2f7fe0', '#d63a2a', '#e8b923', '#3fae4a', '#9450d0', '#f2f2f2', '#1b1b1b'] as const;
export const TINT_COLOR_NAMES: Record<(typeof TINT_COLORS)[number], string> = {
  '#2f7fe0': 'Blue',
  '#d63a2a': 'Red',
  '#e8b923': 'Yellow',
  '#3fae4a': 'Green',
  '#9450d0': 'Purple',
  '#f2f2f2': 'White',
  '#1b1b1b': 'Black',
};
/** Stickers a tint may put on each of its territories, in the order they sit side by side. */
export const TINT_STAMPS = ['sietch', 'city', 'palace', 'atomics'] as const;
export type TintStamp = (typeof TINT_STAMPS)[number];
/** What a tint can switch on and off after it is made: whether it shows, and each sticker. */
const TINT_SETTINGS = ['hidden', ...TINT_STAMPS] as const;
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
const stampsSchema = z.array(z.enum(TINT_STAMPS)).max(TINT_STAMPS.length);

const tintSchema = z.strictObject({
  id,
  name: nameSchema,
  color: colorSchema,
  stamps: stampsSchema.optional(),
  /* Hidden for everyone, so a tint kept for later stays out of the way. */
  hidden: z.literal(true).optional(),
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
    stamps: stampsSchema.optional(),
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
  /* Like painting, says what the page wants rather than flipping, so two players switching at once agree. */
  z.strictObject({ kind: z.literal('tint-set'), tintId: id, setting: z.enum(TINT_SETTINGS), on: z.boolean() }),
  z.strictObject({ kind: z.literal('tint-remove'), tintId: id }),
]);
export type TerritoryTintAction = z.infer<typeof territoryTintActionSchema>;
export const isTerritoryTintAction = actionKindGuard(territoryTintActionSchema);

/* Room for the command's envelope around the action: its type, ID and revision. */
const ENVELOPE_ALLOWANCE = 512;

/** Whether the table can read this action; a custom board's names can make a territory ID or a preset too long, and the page sends neither rather than lose its connection. */
export function fitsTintCommand(action: TerritoryTintAction) {
  return (
    territoryTintActionSchema.safeParse(action).success &&
    JSON.stringify(action).length <= CLIENT_MESSAGE_LIMIT - ENVELOPE_ALLOWANCE
  );
}

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
  const { tintId, kind: _kind, territories, stamps, ...rest } = action;
  const tint: TerritoryTint = {
    id: tintId,
    ...rest,
    ...(stamps?.length ? { stamps: TINT_STAMPS.filter((stamp) => stamps.includes(stamp)) } : {}),
    territories: [...new Set(territories)],
  };
  return { tints: [...tints, tint], message: `New tint: ${tint.name}.` };
}

function replaced(tints: readonly TerritoryTint[], tint: TerritoryTint, next: TerritoryTint) {
  return tints.map((candidate) => (candidate === tint ? next : candidate));
}

function withTerritories(tints: readonly TerritoryTint[], tint: TerritoryTint, territories: string[]) {
  return replaced(tints, tint, { ...tint, territories });
}

const STAMP_NAMES: Record<TintStamp, string> = {
  sietch: 'sietch',
  city: 'city',
  palace: 'palace',
  atomics: 'explosion',
};

/** Whether the setting is on for this tint: it is hidden, or carries that sticker. */
export function tintSetting(
  tint: TerritoryTint,
  setting: Extract<TerritoryTintAction, { kind: 'tint-set' }>['setting']
) {
  return setting === 'hidden' ? !!tint.hidden : !!tint.stamps?.includes(setting);
}

function settingMessage(tint: TerritoryTint, setting: TintStamp | 'hidden', on: boolean) {
  if (setting === 'hidden') {
    return on ? `Hid ${tint.name}.` : `Showed ${tint.name}.`;
  }
  return on
    ? `Put ${STAMP_NAMES[setting]} stickers on ${tint.name}.`
    : `Took the ${STAMP_NAMES[setting]} stickers off ${tint.name}.`;
}

function setTint(
  tints: readonly TerritoryTint[],
  tint: TerritoryTint,
  { setting, on }: Extract<TerritoryTintAction, { kind: 'tint-set' }>
): Applied {
  if (tintSetting(tint, setting) === on) {
    throw new GameRejection(`Someone changed ${tint.name} first.`);
  }
  const { hidden: _hidden, stamps: _stamps, ...plain } = tint;
  const hidden = setting === 'hidden' ? on : !!tint.hidden;
  const stamps = TINT_STAMPS.filter((stamp) => (stamp === setting ? on : !!tint.stamps?.includes(stamp)));
  return {
    tints: replaced(tints, tint, {
      ...plain,
      ...(stamps.length ? { stamps } : {}),
      ...(hidden ? { hidden: true as const } : {}),
    }),
    message: settingMessage(tint, setting, on),
  };
}

function paintIn(tints: readonly TerritoryTint[], tint: TerritoryTint, territory: string, name: string): Applied {
  if (tint.territories.includes(territory)) {
    throw new GameRejection(`${name} is already in ${tint.name}.`);
  }
  if (tint.territories.length >= MAX_TINT_TERRITORIES) {
    throw new GameRejection(`A tint covers at most ${MAX_TINT_TERRITORIES} territories.`);
  }
  return {
    tints: withTerritories(tints, tint, [...tint.territories, territory]),
    message: `Added ${name} to ${tint.name}.`,
  };
}

function paintOut(tints: readonly TerritoryTint[], tint: TerritoryTint, territory: string, name: string): Applied {
  if (!tint.territories.includes(territory)) {
    throw new GameRejection(`${name} is not in ${tint.name}.`);
  }
  return {
    tints: withTerritories(
      tints,
      tint,
      tint.territories.filter((id) => id !== territory)
    ),
    message: `Took ${name} out of ${tint.name}.`,
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
  if (action.kind === 'tint-set') {
    return setTint(tints, tint, action);
  }
  return (action.painted ? paintIn : paintOut)(tints, tint, action.territory, action.name);
}
