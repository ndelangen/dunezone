import { z } from 'zod';

import { TERRITORY_NAME_LIMIT } from '../boards/schema';
import {
  TINT_STAMPS,
  TINT_STAMP_NAMES,
  tintColorSchema as colorSchema,
  tintStampsSchema as stampsSchema,
  tintTerritorySchema as territorySchema,
} from '../boards/tints';
import type { TintStamp } from '../boards/tints';
import { actionKindGuard } from './actionKinds';
import { CLIENT_MESSAGE_LIMIT } from './messageLimit';
import { GameRejection } from './rejection';
import { tableIdSchema as id } from './schema';

export { TINT_STAMP_NAMES, tintPaint } from '../boards/tints';
export type { TintStamp } from '../boards/tints';

/* The switches that are not stickers: whether a tint shows, and whether it is drawn as one outline round its territories. */
const TINT_FLAGS = ['hidden', 'outline'] as const;
type TintFlag = (typeof TINT_FLAGS)[number];
/** What a tint can switch on and off after it is made: whether it shows, its outline-only look, and each sticker. */
const TINT_SETTINGS = [...TINT_FLAGS, ...TINT_STAMPS] as const;
export const MAX_TINTS = 12;
/* Far more than any board's territories; bounds what one tint stores and resends. */
const MAX_TINT_TERRITORIES = 128;

const nameSchema = z.string().trim().min(1).max(48);

const tintSchema = z.strictObject({
  id,
  name: nameSchema,
  color: colorSchema,
  stamps: stampsSchema.optional(),
  /* Hidden for everyone, so a tint kept for later stays out of the way. */
  hidden: z.literal(true).optional(),
  /* Drawn as one line round its territories, borders between them left out, with no fill. */
  outline: z.literal(true).optional(),
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
  z.strictObject({ kind: z.literal('tint-color'), tintId: id, color: colorSchema }),
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

const isFlag = (setting: TintFlag | TintStamp): setting is TintFlag =>
  (TINT_FLAGS as readonly string[]).includes(setting);

/** Whether the setting is on for this tint: it is hidden or outlined, or carries that sticker. */
export function tintSetting(
  tint: TerritoryTint,
  setting: Extract<TerritoryTintAction, { kind: 'tint-set' }>['setting']
) {
  return isFlag(setting) ? !!tint[setting] : !!tint.stamps?.includes(setting);
}

const FLAG_MESSAGES: Record<TintFlag, [on: string, off: string]> = {
  hidden: ['Hid', 'Showed'],
  outline: ['Outlined', 'Filled in'],
};

function settingMessage(tint: TerritoryTint, setting: TintFlag | TintStamp, on: boolean) {
  if (isFlag(setting)) {
    return `${FLAG_MESSAGES[setting][on ? 0 : 1]} ${tint.name}.`;
  }
  return on
    ? `Put ${TINT_STAMP_NAMES[setting].toLowerCase()} stickers on ${tint.name}.`
    : `Took the ${TINT_STAMP_NAMES[setting].toLowerCase()} stickers off ${tint.name}.`;
}

/** The tint with one setting switched, its stickers kept in their set order. */
function withSetting(tint: TerritoryTint, setting: TintFlag | TintStamp, on: boolean): TerritoryTint {
  const { hidden: _hidden, outline: _outline, stamps: _stamps, ...plain } = tint;
  const has = (name: TintFlag | TintStamp) => (name === setting ? on : tintSetting(tint, name));
  const stamps = TINT_STAMPS.filter(has);
  return {
    ...plain,
    ...(stamps.length ? { stamps } : {}),
    ...(has('hidden') ? { hidden: true as const } : {}),
    ...(has('outline') ? { outline: true as const } : {}),
  };
}

function setTint(
  tints: readonly TerritoryTint[],
  tint: TerritoryTint,
  { setting, on }: Extract<TerritoryTintAction, { kind: 'tint-set' }>
): Applied {
  if (tintSetting(tint, setting) === on) {
    throw new GameRejection(`Someone changed ${tint.name} first.`);
  }
  return { tints: replaced(tints, tint, withSetting(tint, setting, on)), message: settingMessage(tint, setting, on) };
}

function recolor(tints: readonly TerritoryTint[], tint: TerritoryTint, color: string): Applied {
  if (tint.color === color) {
    throw new GameRejection(`${tint.name} is already that colour.`);
  }
  return { tints: replaced(tints, tint, { ...tint, color }), message: `Recoloured ${tint.name}.` };
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
  if (action.kind === 'tint-color') {
    return recolor(tints, tint, action.color);
  }
  if (action.kind === 'tint-set') {
    return setTint(tints, tint, action);
  }
  return (action.painted ? paintIn : paintOut)(tints, tint, action.territory, action.name);
}
