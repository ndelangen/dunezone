import { z } from 'zod';

import { actionKindGuard } from './actionKinds';
import { tableCountSchema as count, tableIdSchema as id } from './schema';

/**
 * Who is allied with whom (#1007): public, as the rules make alliances public.
 * A faction offers an alliance to another;
 * once that faction accepts, the two are allied.
 * A faction is in one alliance at a time: it breaks the alliance before it offers or accepts another.
 * The table checks only that the factions agreed, never when a Nexus is open, so players apply their ruleset as they do at a physical table.
 */
export const allianceStateSchema = z.object({
  /*
   * Each alliance carries at least two faction ids and a stable group mark retained by stored games.
   * Presentation takes colours from the allied factions rather than interpreting the mark as a palette slot.
   */
  groups: z.array(z.object({ members: z.array(id).min(2), mark: count })),
  /* Offers waiting on an answer, oldest first; each carries the table revision it was made at, so an answer names the very offer its player saw. */
  offers: z.array(z.object({ from: id, to: id, at: count, id: count })),
});
export type AllianceState = z.infer<typeof allianceStateSchema>;

export const allianceActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('alliance-offer'), factionId: id }),
  /* A withdrawal or an accept names the offer by its id, so a late one never reaches an offer made again since. */
  z.strictObject({ kind: z.literal('alliance-withdraw'), factionId: id, offer: count }),
  z.strictObject({ kind: z.literal('alliance-accept'), factionId: id, offer: count }),
  /* Names one ally the breaking faction saw; the Room also refuses a break sent against a table that has changed since. */
  z.strictObject({ kind: z.literal('alliance-break'), factionId: id }),
]);
export type AllianceAction = z.infer<typeof allianceActionSchema>;
export const isAllianceAction = actionKindGuard(allianceActionSchema);

export function emptyAlliances(): AllianceState {
  return { groups: [], offers: [] };
}

/** The factions allied with `factionId`, itself left out; empty when it stands alone. */
export function alliesOf(state: AllianceState | undefined, factionId: string): string[] {
  return allianceOf(state, factionId)?.members.filter((member) => member !== factionId) ?? [];
}

/** The alliance `factionId` belongs to, if any. */
export function allianceOf(state: AllianceState | undefined, factionId: string) {
  return state?.groups.find((group) => group.members.includes(factionId));
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
  /* The table's revision before this command: every change raises it, so it names a new offer uniquely. */
  revision: number;
};

/* The lowest group mark no alliance holds. */
function freeMark(state: AllianceState): number {
  const taken = new Set(state.groups.map((group) => group.mark));
  let mark = 0;
  while (taken.has(mark)) {
    mark += 1;
  }
  return mark;
}

/* The two factions an offer, an answer, a withdrawal or a break is about. */
type Pair = Readonly<{ from: string; to: string }>;

/** Allies the two factions, dropping every offer to or from either: neither may offer or accept another while allied. */
function join(state: AllianceState, { from: a, to: b }: Pair): AllianceState {
  const members = [a, b];
  return {
    groups: [...state.groups, { members, mark: freeMark(state) }],
    offers: state.offers.filter((offer) => !members.includes(offer.from) && !members.includes(offer.to)),
  };
}

/* Refuses an offer or an accept while either faction is already in an alliance. */
function requireUnallied(state: AllianceState, { from, to }: Pair) {
  if (alliesOf(state, from).length) {
    refuse('Break your alliance before you join another.');
  }
  if (alliesOf(state, to).length) {
    refuse('That faction is already in an alliance.');
  }
}

function without(state: AllianceState, { from, to }: Pair): AllianceState {
  return { ...state, offers: state.offers.filter((offer) => offer.from !== from || offer.to !== to) };
}

/* The offer `from` is waiting on `to` to answer, if any; a faction has at most one offer out to another. */
function waitingOffer(state: AllianceState, { from, to }: Pair) {
  return state.offers.find((offer) => offer.from === from && offer.to === to);
}

/* A withdrawal of an offer that is already gone, or was made again since, changes nothing. */
function withdraw(
  state: AllianceState,
  { factionId: to, offer }: Extract<AllianceAction, { kind: 'alliance-withdraw' }>,
  { factionId }: AllianceContext
) {
  const pair = { from: factionId, to };
  return waitingOffer(state, pair)?.id === offer ? without(state, pair) : state;
}

function offer(
  state: AllianceState,
  to: string,
  { factionId, factions, now, revision }: AllianceContext
): AllianceState {
  if (to === factionId || !factions.includes(to)) {
    return refuse('Choose another faction at the table.');
  }
  requireUnallied(state, { from: factionId, to });
  /*
   * Only an explicit accept, which names the offer its player saw, answers an offer.
   * An offer back never does, so a late offer can't re-form an alliance broken since.
   */
  if (waitingOffer(state, { from: to, to: factionId })) {
    return refuse('That faction has offered you an alliance. Accept it instead.');
  }
  if (waitingOffer(state, { from: factionId, to })) {
    return state;
  }
  return { ...state, offers: [...state.offers, { from: factionId, to, at: now, id: revision }] };
}

type Accept = Extract<AllianceAction, { kind: 'alliance-accept' }>;
function accept(state: AllianceState, { factionId: from, offer }: Accept, { factionId }: AllianceContext) {
  const pair = { from, to: factionId };
  if (waitingOffer(state, pair)?.id !== offer) {
    return refuse('That alliance offer was withdrawn.');
  }
  requireUnallied(state, { from: factionId, to: from });
  return join(state, pair);
}

/** Breaking an alliance takes the faction out of it; an alliance left with one faction is over. */
function breakAway(state: AllianceState, { from, to }: Pair): AllianceState {
  if (!alliesOf(state, from).includes(to)) {
    return refuse('That alliance has already changed.');
  }
  return {
    ...state,
    groups: state.groups
      .map((group) => ({ ...group, members: group.members.filter((member) => member !== from) }))
      .filter((group) => group.members.length > 1),
  };
}

/** The alliances after one command; the Worker supplies who acts and which factions sit at the table. */
export function applyAlliance(state: AllianceState, action: AllianceAction, context: AllianceContext): AllianceState {
  switch (action.kind) {
    case 'alliance-offer':
      return offer(state, action.factionId, context);
    case 'alliance-withdraw':
      return withdraw(state, action, context);
    case 'alliance-accept':
      return accept(state, action, context);
    case 'alliance-break':
      return breakAway(state, { from: context.factionId, to: action.factionId });
  }
}
