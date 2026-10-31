import { isBattleCard, isBattleLeader } from '@shared/play/battle';
import type { BattleFace, BattlePlan, BattlePlanInput, Disclosure, PublicBattle } from '@shared/play/battle';
import {
  dialsFlat,
  dialsFree,
  flatStrength,
  KISS_DIAL_CAP,
  KISS_FREE_TROOPS,
  kissSpice,
  spiceStrength,
  spiceStrengthChoices,
  troopCount,
} from '@shared/play/battleDialing';
import type { TablePiece } from '@shared/play/model';
import type { ComponentProps } from 'react';

import type { TroopToken } from '@game/assets/faction/troop/Troop';
import type { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';

/** What a battle plan window says it wants: a plan edit, a piece moved in the player's own order, readiness, or a part shown or hidden before the reveal. */
type PlanIntents = Readonly<{
  onEdit: (patch: Partial<BattlePlanInput>) => void;
  /** Moves a piece to just before another, or to the end with null, in the order every window lists the player's pieces in. */
  onReorder: (piece: TablePiece, before: string | null) => void;
  onReady: (ready: boolean) => void;
  onDisclose: (disclosure: Disclosure, shown: boolean) => void;
}>;

/** The faction's dress for the battle wheel: its background, and each troop face's token artwork by face id. */
export type WheelArt = Readonly<{
  background: ComponentProps<typeof BackgroundRenderer>['background'];
  troops: Readonly<Record<string, ComponentProps<typeof TroopToken>>>;
  /** Each troop face's description as the faction tells it, by face id. */
  descriptions?: Readonly<Record<string, string>>;
}>;

/** The other side of the battle, as far as the viewer may know it. */
export type Opponent = Readonly<{ name: string; ready: boolean }>;

/**
 * Everything a battle plan window shows: the viewer's own plan, the pieces they could commit, their spice and the battle around it.
 * Data in, intents out;
 * the window never sends a command itself.
 */
export type BattlePlanViewProps = Readonly<{
  plan: BattlePlan;
  /** The viewer's hand, in their own order; the plan's own pieces are added to it, so a committed piece stays in reach. */
  hand: readonly TablePiece[];
  /** The spice reserve, not counting what the plan already sets aside. */
  balance: number;
  stage: PublicBattle['stage'];
  ready: boolean;
  /** False for a viewer who may not change the table, such as during a replay. */
  canAct: boolean;
  opponent: Opponent | null;
  /** Each leader's printed strength by piece id, when the faction's capture names it. */
  leaderStrength?: Readonly<Record<string, number>>;
  /** How many troops of each face the faction owns, by face id: the most a plan can dial. */
  troopLimit?: Readonly<Record<string, number>>;
  /** The physical troop each face belongs to, by face id: a troop's two faces share its count. */
  troopOf?: Readonly<Record<string, string>>;
  /** How the plan's battle wheel is dressed; the wheel stays in view while the plan is edited. */
  wheelArt: WheelArt;
}> &
  PlanIntents;

/** The troops one face fights with: unsupported and spice-supported. */
export type FaceTroops = Readonly<{ undialed: number; dialed: number }>;

/** The faction's own forces, used where no limit is known: a full reserve. */
const DEFAULT_TROOP_LIMIT = 20;

export const MODE_HELP =
  'Max: pick the troops and the spice; the spice supports as many as it can.\nCustom: pick supported and unsupported troops per type; the spice follows.';

export const FREE_SUPPORT_HELP = 'Your troops fight at full strength without spice: say how many fight.';

/** The pieces a plan can draw on: the hand, private side-table included, and the plan's own, each once. */
export function planPieces(plan: BattlePlan, hand: readonly TablePiece[]): TablePiece[] {
  return [...hand, ...plan.pieces].filter(
    (piece, index, all) => all.findIndex((candidate) => candidate.id === piece.id) === index
  );
}

export const leadersOf = (pieces: readonly TablePiece[]) => pieces.filter(isBattleLeader);
/** The cards a plan can take: Treachery cards only, plus any card an older plan already holds, so it can still be taken out. */
export const cardsOf = (pieces: readonly TablePiece[], chosen: readonly string[]) =>
  pieces.filter((piece) => isBattleCard(piece) || chosen.includes(piece.id));

export const capableFaces = (plan: BattlePlan) => plan.faces.filter((face) => face.capable);

/**
 * Whether spice changes anything for this faction under its ruleset's dialing.
 * Advanced: some troop fights stronger with spice and has to pay for it.
 * Basic: never.
 * GF9 2.0 and KISS: unless the faction never pays (Fremen), spice buys spice strength or pays for the dial.
 */
export function spiceMatters(plan: BattlePlan) {
  if (plan.dialing === 'basic') {
    return false;
  }
  if (dialsFlat(plan.dialing)) {
    return !dialsFree(plan.faces);
  }
  return capableFaces(plan).some((face) => face.supportCost > 0 && face.supportedStrength > face.strength);
}

/**
 * Whether the player has a support choice to make in Custom: some troop fights differently supported, even where support costs nothing.
 * A plan already in Custom keeps its controls, so it never loses its supported troops to the simpler editor.
 */
export function supportMatters(plan: BattlePlan) {
  if (dialsFlat(plan.dialing)) {
    return false;
  }
  return plan.mode === 'custom' || capableFaces(plan).some((face) => face.supportedStrength !== face.strength);
}

export function troopsOf(plan: BattlePlan, faceId: string): FaceTroops {
  const troop = plan.troops.find((entry) => entry.faceId === faceId);
  return { undialed: troop?.undialed ?? 0, dialed: troop?.dialed ?? 0 };
}

/** The plan's troops with one face's counts changed. */
export function withTroops(plan: BattlePlan, faceId: string, change: Partial<FaceTroops>): BattlePlanInput['troops'] {
  const troop = { faceId, ...troopsOf(plan, faceId), ...change };
  return [...plan.troops.filter((entry) => entry.faceId !== faceId), troop];
}

/** In Max mode a face's troops are one number; the spice decides how many of them are supported. */
export function totalOf(plan: BattlePlan, faceId: string) {
  const { undialed, dialed } = troopsOf(plan, faceId);
  return undialed + dialed;
}

export function setTotal(plan: BattlePlan, faceId: string, total: number): Partial<BattlePlanInput> {
  const troops = withTroops(plan, faceId, { undialed: Math.max(0, total), dialed: 0 });
  if (plan.dialing === 'kiss') {
    /* KISS spice follows the troops, so the window shows what the dial costs before the room answers. */
    return { troops, spice: kissSpice(troopCount(troops), dialsFree(plan.faces)) };
  }
  if (plan.dialing === 'gf92') {
    /* Spice strength the smaller dial no longer reaches comes down with it, as the room would take it down. */
    const choices = spiceStrengthChoices(flatStrength(troops, plan.faces), dialsFree(plan.faces));
    return { troops, spice: choices.findLast((choice) => choice <= plan.spice) ?? 0 };
  }
  return { troops };
}

/** The dialed troop strength under a full-strength mechanism, before spice strength and the adjustment. */
export const flatDial = (plan: BattlePlan) => flatStrength(plan.troops, plan.faces);

/** The spice strength a GF9 2.0 plan adds; nothing under any other mechanism. */
export function spiceBonus(plan: BattlePlan) {
  return plan.dialing === 'gf92' ? spiceStrength(flatDial(plan), plan.spice, dialsFree(plan.faces)) : 0;
}

/** The GF9 2.0 spice amounts this plan can spend now: the dial reaches them and the viewer holds them. */
export function spiceStrengthOptions(plan: BattlePlan, balance: number) {
  return spiceStrengthChoices(flatDial(plan), dialsFree(plan.faces)).filter(
    (choice) => choice <= availableSpice(plan, balance)
  );
}

/** A GF9 2.0 spice amount moved to one the plan can spend: onward in the direction it moved, or the most it can. */
export function snapSpiceStrength(plan: BattlePlan, balance: number, wanted: number) {
  const options = spiceStrengthOptions(plan, balance);
  const onward = wanted > plan.spice ? options.find((choice) => choice >= wanted) : undefined;
  return onward ?? options.findLast((choice) => choice <= wanted) ?? 0;
}

/** Everything the plan could spend: the reserve and what the plan already holds. */
const availableSpice = (plan: BattlePlan, balance: number) => balance + plan.spice;

/**
 * Every spice amount whole troops can use up exactly in Max mode, within what the viewer has, lowest first.
 * The Worker refuses any other amount, since no number of supported troops adds up to it.
 */
export function supportableSpice(plan: BattlePlan, balance: number): number[] {
  const limit = availableSpice(plan, balance);
  const reachable = new Set([0]);
  for (const face of capableFaces(plan)) {
    if (!face.supportCost) {
      continue;
    }
    for (let count = 0; count < totalOf(plan, face.id); count++) {
      /* A snapshot, so each pass adds one more troop at most. */
      for (const spent of Array.from(reachable)) {
        if (spent + face.supportCost <= limit) {
          reachable.add(spent + face.supportCost);
        }
      }
    }
  }
  return [...reachable].sort((a, b) => a - b);
}

/** The spice that would support every troop in Max mode, or as many as the viewer's spice reaches exactly. */
export function fullSupport(plan: BattlePlan, balance: number) {
  const wanted = capableFaces(plan).reduce((total, face) => total + totalOf(plan, face.id) * face.supportCost, 0);
  return supportableSpice(plan, balance).findLast((amount) => amount <= wanted) ?? 0;
}

/** A spice amount moved to one whole troops can use: onward in the direction it moved, or the most they can use when it went past that. */
export function snapSpice(plan: BattlePlan, balance: number, wanted: number) {
  const amounts = supportableSpice(plan, balance);
  const onward = wanted > plan.spice ? amounts.find((amount) => amount >= wanted) : undefined;
  return onward ?? amounts.findLast((amount) => amount <= wanted) ?? 0;
}

/** The most supported troops a face can have in Custom mode, given the spice the other faces already spend. */
export function supportedMax(plan: BattlePlan, face: BattleFace, balance: number) {
  if (!face.supportCost) {
    return undefined;
  }
  const others = plan.troops.reduce((total, entry) => {
    const other = plan.faces.find((candidate) => candidate.id === entry.faceId);
    return entry.faceId === face.id ? total : total + entry.dialed * (other?.supportCost ?? 0);
  }, 0);
  return Math.max(0, Math.floor((availableSpice(plan, balance) - others) / face.supportCost));
}

/** The most troops a face can field: its troop's count, less what the troop's other face already fields. */
export function troopLimitOf(
  props: Pick<BattlePlanViewProps, 'plan' | 'troopLimit' | 'troopOf'> & { balance?: number },
  faceId: string
) {
  const limit = props.troopLimit?.[faceId] ?? DEFAULT_TROOP_LIMIT;
  const troop = props.troopOf?.[faceId];
  const fielded = capableFaces(props.plan)
    .filter((face) => face.id !== faceId && troop !== undefined && props.troopOf?.[face.id] === troop)
    .reduce((total, face) => total + totalOf(props.plan, face.id), 0);
  const owned = Math.max(0, limit - fielded);
  return props.plan.dialing === 'kiss' ? Math.min(owned, kissLimit(props.plan, faceId, props.balance)) : owned;
}

/**
 * The most troops of one face a KISS dial takes: the dial stops at 20, and every troop past the free ones needs a spice the viewer holds.
 * Without a known balance only the cap applies.
 */
function kissLimit(plan: BattlePlan, faceId: string, balance?: number) {
  const face = plan.faces.find((candidate) => candidate.id === faceId);
  const others = plan.troops.filter((troop) => troop.faceId !== faceId);
  const room = KISS_DIAL_CAP - flatStrength(others, plan.faces);
  const byCap = face && face.supportedStrength > 0 ? Math.floor(room / face.supportedStrength) : DEFAULT_TROOP_LIMIT;
  if (balance === undefined || dialsFree(plan.faces)) {
    return Math.max(0, byCap);
  }
  const bySpice = availableSpice(plan, balance) + KISS_FREE_TROOPS - troopCount(others);
  return Math.max(0, Math.min(byCap, bySpice));
}

/** The ids in the order given, then any the order does not name. */
function arranged(order: readonly string[], ids: readonly string[]) {
  return [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id))];
}

/** Puts a piece in among the chosen ones, in the player's order, or takes it out. */
export function toggleIn(chosen: readonly string[], id: string, order: readonly string[] = chosen) {
  return chosen.includes(id) ? chosen.filter((entry) => entry !== id) : arranged(order, [...chosen, id]);
}

/** Puts a card into the plan or takes it out. */
export function toggleCard(plan: BattlePlan, cardId: string, order?: readonly string[]): Partial<BattlePlanInput> {
  return { cardIds: toggleIn(plan.cardIds, cardId, order) };
}

/** Puts a leader into the plan beside any already there, or takes it out: a plan usually holds one, but may hold several. */
export function toggleLeader(plan: BattlePlan, leaderId: string, order?: readonly string[]): Partial<BattlePlanInput> {
  return { leaderIds: toggleIn(plan.leaderIds, leaderId, order) };
}

export function planLocks(props: Pick<BattlePlanViewProps, 'canAct' | 'ready' | 'stage' | 'plan'>) {
  const locked = !props.canAct || props.ready || props.stage !== 'preparing';
  return {
    locked,
    dialLocked: locked || props.plan.disclosed.dial,
    leaderLocked: locked || props.plan.disclosed.leader,
    cardLocked: (cardId: string) => locked || props.plan.disclosed.cardIds.includes(cardId),
    /** Showing parts early is a choice made while preparing, Ready or not. */
    revealLocked: !props.canAct || props.stage !== 'preparing',
  };
}

/** A strength as the table writes it: halves as ½. */
export function formatStrength(value: number) {
  const whole = Math.trunc(value);
  const half = Math.abs(value - whole) === 0.5;
  if (half) {
    return `${whole === 0 && value < 0 ? '-' : ''}${whole === 0 ? '' : whole}½`;
  }
  return String(Math.round(value * 100) / 100);
}

/** The disclosures each part of the plan maps to. */
export const disclosure = {
  leader: { element: 'leader' } as Disclosure,
  dial: { element: 'dial' } as Disclosure,
  card: (cardId: string): Disclosure => ({ element: 'card', cardId }),
};

export function isShown(plan: BattlePlan, part: Disclosure) {
  if (part.element === 'card') {
    return plan.disclosed.cardIds.includes(part.cardId);
  }
  return plan.disclosed[part.element];
}
