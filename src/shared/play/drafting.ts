import { z } from 'zod';

import { Background, CanonicalFactionStoredSchema } from '../factions/schema';
import { tableCountSchema, tableIdentitySchema, tableSeatSchema } from './schema';

/*
 * Drafting, from the contract settled on #1010: every player keeps a draft list and a ban list;
 * a ban strips the faction from every list and blocks new picks; readiness clears on any pick,
 * ban or roster change; assignment happens by itself once the roster meets the minimum, every
 * player is ready and the pool holds enough eligible factions, dealing each player one faction
 * and one station at random. The state below is public: every viewer sees the same draft.
 */

/** The Worker refreshes its copy of the catalogue at most this often while a game drafts. */
export const PLAY_DRAFT_CATALOGUE_TTL_MS = 30_000;

/** One faction as the draft knows it: enough to draw its real token, and whether it may be dealt. */
const draftFactionSchema = z.object({
  id: tableIdentitySchema,
  slug: z.string().max(160),
  name: z.string().max(160),
  logo: CanonicalFactionStoredSchema.shape.logo,
  background: Background,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  /* Linked to the game's ruleset: shown first, and the source of random filling. */
  linked: z.boolean(),
  /* Its token is published: only these can be drafted; the capture at assignment judges the rest. */
  published: z.boolean(),
});
export type DraftFaction = z.infer<typeof draftFactionSchema>;

/** The catalogue's answer to a drafting game: every live faction with its link to the game's ruleset. */
export const playDraftableFactionsSchema = z.object({ factions: z.array(draftFactionSchema).max(500) });

const seatLists = z.record(tableSeatSchema, z.array(tableIdentitySchema));

export const draftStateSchema = z.object({
  /* The start gate the game was created with: the roster must reach it before seats are dealt. */
  minimum: z.number().int().min(2).max(18),
  factions: z.array(draftFactionSchema),
  /* When the factions above were read; a stale copy is refreshed on the next draft command. */
  catalogueAt: tableCountSchema,
  picks: seatLists,
  bans: seatLists,
  ready: z.array(tableSeatSchema),
  /* Why the last automatic assignment did not commit, until the next change; null when it never failed. */
  failure: z.string().max(400).nullable(),
});
export type DraftState = z.infer<typeof draftStateSchema>;

export function emptyDraft(minimum: number, factions: DraftFaction[] = [], catalogueAt = 0): DraftState {
  return { minimum, factions, catalogueAt, picks: {}, bans: {}, ready: [], failure: null };
}

export const draftActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('draft-pick'), factionId: tableIdentitySchema }),
  z.strictObject({ kind: z.literal('draft-unpick'), factionId: tableIdentitySchema }),
  z.strictObject({ kind: z.literal('draft-ban'), factionId: tableIdentitySchema }),
  z.strictObject({ kind: z.literal('draft-unban'), factionId: tableIdentitySchema }),
  z.strictObject({ kind: z.literal('draft-ready'), ready: z.boolean() }),
]);
export type DraftAction = z.infer<typeof draftActionSchema>;

const DRAFT_ACTION_KINDS: ReadonlySet<string> = new Set(
  draftActionSchema.options.map((option) => option.shape.kind.value)
);

export function isDraftAction(action: { kind: string }): action is DraftAction {
  return DRAFT_ACTION_KINDS.has(action.kind);
}

export function bannedIds(draft: DraftState): string[] {
  return [...new Set(Object.values(draft.bans).flat())];
}

export function isBanned(draft: DraftState, factionId: string): boolean {
  return Object.values(draft.bans).some((list) => list.includes(factionId));
}

/** A pick the catalogue still lists as published; a faction unpublished or removed since the pick weighs nothing. */
function stillDealable(draft: DraftState, factionId: string): boolean {
  return draft.factions.some((faction) => faction.id === factionId && faction.published);
}

/** The drafted pool: every distinct dealable pick that is not banned, in the order it was first picked. */
export function draftedPool(draft: DraftState): string[] {
  const pool: string[] = [];
  for (const list of Object.values(draft.picks)) {
    for (const id of list) {
      if (!pool.includes(id) && !isBanned(draft, id) && stillDealable(draft, id)) {
        pool.push(id);
      }
    }
  }
  return pool;
}

export function pickersOf(draft: DraftState, factionId: string): string[] {
  return Object.entries(draft.picks).flatMap(([seat, list]) => (list.includes(factionId) ? [seat] : []));
}

export function bannersOf(draft: DraftState, factionId: string): string[] {
  return Object.entries(draft.bans).flatMap(([seat, list]) => (list.includes(factionId) ? [seat] : []));
}

/** Linked, published, unbanned factions outside the drafted pool: what random filling can add. */
function fillableFactions(draft: DraftState): DraftFaction[] {
  const pool = draftedPool(draft);
  return draft.factions.filter(
    (faction) => faction.linked && faction.published && !isBanned(draft, faction.id) && !pool.includes(faction.id)
  );
}

/** The three gates assignment waits on, measured against the players seated now. */
export function draftGates(draft: DraftState, seated: readonly string[], minimum: number) {
  const poolSize = draftedPool(draft).length;
  const fillable = fillableFactions(draft).length;
  const ready = seated.filter((seat) => draft.ready.includes(seat)).length;
  return {
    seated: seated.length,
    minimum,
    ready,
    poolSize,
    fillable,
    minimumMet: seated.length >= minimum,
    enoughFactions: poolSize + fillable >= seated.length,
    allReady: seated.length > 0 && ready === seated.length,
  };
}

export type DraftGates = ReturnType<typeof draftGates>;

export function draftStatus(gates: DraftGates): string {
  switch (true) {
    case !gates.minimumMet:
      return `Waiting for ${gates.minimum - gates.seated} more ${gates.minimum - gates.seated === 1 ? 'player' : 'players'}`;
    case !gates.enoughFactions:
      return 'Not enough factions in the pool';
    case !gates.allReady:
      return `Waiting for ${gates.seated - gates.ready} to ready`;
    default:
      return 'Assigning seats';
  }
}

/** The #1010 note: non-blocking when the drafted count differs from the player count, blocking when the pool is too small. */
export type DraftWarning = { kind: 'none' } | { kind: 'fill' | 'subset' | 'short'; text: string };

export function draftWarning(gates: DraftGates): DraftWarning {
  const players = `${gates.seated} ${gates.seated === 1 ? 'player' : 'players'}`;
  switch (true) {
    case !gates.enoughFactions: {
      const missing = gates.seated - gates.poolSize - gates.fillable;
      return {
        kind: 'short',
        text: `The pool is too small for ${players}: ${gates.poolSize} drafted and ${gates.fillable} suitable ${gates.fillable === 1 ? 'faction' : 'factions'} left to fill with, ${missing} short. Remove a ban or draft more factions before anyone can be dealt.`,
      };
    }
    case gates.poolSize < gates.seated: {
      const add = gates.seated - gates.poolSize;
      return {
        kind: 'fill',
        text: `${gates.poolSize} ${gates.poolSize === 1 ? 'faction is' : 'factions are'} drafted for ${players}: ${add} random suitable ${add === 1 ? 'faction' : 'factions'} will be added at assignment.`,
      };
    }
    case gates.poolSize > gates.seated:
      return {
        kind: 'subset',
        text: `${gates.poolSize} factions are drafted for ${players}: a random ${gates.seated} of them will be dealt.`,
      };
    default:
      return { kind: 'none' };
  }
}

/** A source of unbiased picks: given n, an integer in [0, n). */
export type Random = (n: number) => number;

/** Fisher and Yates, driven by the caller's random source, so a test can fix the deal. */
function shuffled<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let cursor = copy.length - 1; cursor > 0; cursor--) {
    const other = random(cursor + 1);
    [copy[cursor], copy[other]] = [copy[other]!, copy[cursor]!];
  }
  return copy;
}

/**
 * The factions dealt to a roster of the given size: every drafted faction when there are fewer than players, filled at random from the linked pool;
 * a random subset when there are more;
 * nothing when the eligible total falls short.
 * Repeated picks weigh nothing.
 */
export function resolveFactionPool(draft: DraftState, players: number, random: Random): string[] | null {
  const pool = draftedPool(draft);
  if (pool.length === players) {
    return pool;
  }
  if (pool.length > players) {
    return shuffled(pool, random).slice(0, players);
  }
  const fill = shuffled(
    fillableFactions(draft).map((faction) => faction.id),
    random
  ).slice(0, players - pool.length);
  return pool.length + fill.length === players ? [...pool, ...fill] : null;
}

/** Each player one faction and one station, both at random, with the count fixed at the roster's size. */
export function dealSeats(
  seats: readonly string[],
  factions: readonly string[],
  random: Random
): { seat: string; factionId: string; position: number }[] {
  const dealt = shuffled(factions, random);
  const positions = shuffled(
    seats.map((_, index) => index),
    random
  );
  return seats.map((seat, index) => ({ seat, factionId: dealt[index]!, position: positions[index]! }));
}
