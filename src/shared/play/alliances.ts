import { z } from 'zod';

import { tableCountSchema as count, tableIdSchema as id } from './schema';

/**
 * Who is allied with whom (#1007): public, as the rules make alliances public.
 * A faction offers an alliance to another;
 * once that faction accepts, the two alliances (or lone factions) become one.
 * The table checks only that the factions agreed, never how large an alliance may grow or when a Nexus is open, so players apply their ruleset as they do at a physical table.
 */
export const allianceStateSchema = z.object({
  /* Each alliance as its faction ids, at least two. */
  groups: z.array(z.array(id).min(2)),
  /* Offers waiting on an answer, oldest first. */
  offers: z.array(z.object({ from: id, to: id, at: count })),
});
export type AllianceState = z.infer<typeof allianceStateSchema>;

export const allianceActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('alliance-offer'), factionId: id }),
  z.strictObject({ kind: z.literal('alliance-withdraw'), factionId: id }),
  z.strictObject({ kind: z.literal('alliance-accept'), factionId: id }),
  z.strictObject({ kind: z.literal('alliance-decline'), factionId: id }),
  z.strictObject({ kind: z.literal('alliance-break') }),
]);
export type AllianceAction = z.infer<typeof allianceActionSchema>;
const kinds: ReadonlySet<string> = new Set(allianceActionSchema.options.map((option) => option.shape.kind.value));
export function isAllianceAction(action: { kind: string }): action is AllianceAction {
  return kinds.has(action.kind);
}

export function emptyAlliances(): AllianceState {
  return { groups: [], offers: [] };
}

/** The factions allied with `factionId`, itself left out; empty when it stands alone. */
export function alliesOf(state: AllianceState | undefined, factionId: string): string[] {
  return state?.groups.find((group) => group.includes(factionId))?.filter((member) => member !== factionId) ?? [];
}

export class AllianceRefusal extends Error {}
function refuse(message: string): never {
  throw new AllianceRefusal(message);
}

export type AllianceContext = {
  /* The acting faction. */
  factionId: string;
  /* Every faction at the table. */
  factions: readonly string[];
  now: number;
};

/** Joins the alliances of `a` and `b`, dropping the offers the new alliance answered among its own members. */
function join(state: AllianceState, a: string, b: string): AllianceState {
  const members = [a, ...alliesOf(state, a), b, ...alliesOf(state, b)];
  return {
    groups: [...state.groups.filter((group) => !group.includes(a) && !group.includes(b)), members],
    offers: state.offers.filter((offer) => !(members.includes(offer.from) && members.includes(offer.to))),
  };
}

function without(state: AllianceState, from: string, to: string): AllianceState {
  return { ...state, offers: state.offers.filter((offer) => offer.from !== from || offer.to !== to) };
}

function offer(state: AllianceState, to: string, { factionId, factions, now }: AllianceContext): AllianceState {
  if (to === factionId || !factions.includes(to)) {
    return refuse('Choose another faction at the table.');
  }
  if (alliesOf(state, factionId).includes(to)) {
    return refuse('You are already allied with that faction.');
  }
  /* Offering to a faction that already offered to you answers its offer. */
  if (state.offers.some((entry) => entry.from === to && entry.to === factionId)) {
    return join(state, to, factionId);
  }
  if (state.offers.some((entry) => entry.from === factionId && entry.to === to)) {
    return state;
  }
  return { ...state, offers: [...state.offers, { from: factionId, to, at: now }] };
}

function answer(state: AllianceState, from: string, accept: boolean, { factionId }: AllianceContext) {
  if (!state.offers.some((entry) => entry.from === from && entry.to === factionId)) {
    return refuse('That alliance offer was withdrawn.');
  }
  return accept ? join(state, from, factionId) : without(state, from, factionId);
}

/** Breaking an alliance takes the faction out of it; an alliance left with one faction is over. */
function breakAway(state: AllianceState, factionId: string): AllianceState {
  if (!alliesOf(state, factionId).length) {
    return state;
  }
  return {
    ...state,
    groups: state.groups
      .map((group) => group.filter((member) => member !== factionId))
      .filter((group) => group.length > 1),
  };
}

/** The alliances after one command; the Worker supplies who acts and which factions sit at the table. */
export function applyAlliance(state: AllianceState, action: AllianceAction, context: AllianceContext): AllianceState {
  switch (action.kind) {
    case 'alliance-offer':
      return offer(state, action.factionId, context);
    case 'alliance-withdraw':
      return without(state, context.factionId, action.factionId);
    case 'alliance-accept':
      return answer(state, action.factionId, true, context);
    case 'alliance-decline':
      return answer(state, action.factionId, false, context);
    case 'alliance-break':
      return breakAway(state, context.factionId);
  }
}
