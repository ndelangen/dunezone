import { isBattleLeader } from '@shared/play/battle';
import type { BattleFace, BattlePlan, BattlePlanInput, Disclosure, PublicBattle } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';

/** What a battle plan window says it wants: a plan edit, readiness, or a part shown or hidden before the reveal. */
export type PlanIntents = Readonly<{
  onEdit: (patch: Partial<BattlePlanInput>) => void;
  onReady: (ready: boolean) => void;
  onDisclose: (disclosure: Disclosure, shown: boolean) => void;
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
  /** The viewer's hand; the plan's own pieces are added to it, so a committed piece stays in reach. */
  hand: readonly TablePiece[];
  /** The spice reserve, not counting what the plan already sets aside. */
  balance: number;
  stage: PublicBattle['stage'];
  ready: boolean;
  /** False for a viewer who may not change the table, such as during a replay. */
  canAct: boolean;
  territory: string;
  opponent: Opponent | null;
  /** Each leader's printed strength by piece id, when the faction's capture names it. */
  leaderStrength?: Readonly<Record<string, number>>;
  /** How many troops of each face the faction owns, by face id: the most a plan can dial. */
  troopLimit?: Readonly<Record<string, number>>;
}> &
  PlanIntents;

/** The troops one face fights with: unsupported and spice-supported. */
export type FaceTroops = Readonly<{ undialed: number; dialed: number }>;

/** The faction's own forces, used where no limit is known: a full reserve. */
export const DEFAULT_TROOP_LIMIT = 20;

export const MODE_HELP =
  'Max: say how many troops fight and how much spice backs them, and the spice supports as many as it can. Custom: say for each troop type how many fight unsupported and how many supported; the spice follows.';

/** The pieces a plan can draw on: the hand and the plan's own, each once. */
export function planPieces(plan: BattlePlan, hand: readonly TablePiece[]): TablePiece[] {
  return [...hand.filter((piece) => !piece.hiddenZone), ...plan.pieces].filter(
    (piece, index, all) => all.findIndex((candidate) => candidate.id === piece.id) === index
  );
}

export const leadersOf = (pieces: readonly TablePiece[]) => pieces.filter(isBattleLeader);
/* Traitors, predictions and alliance cards are cards in hand, but never part of a plan: a Traitor is called, not played. */
const NOT_BATTLE_CARDS = new Set(['card-traitor', 'card-prediction', 'card-alliance']);

/** The cards a plan can take, Treachery cards and the like. */
export const cardsOf = (pieces: readonly TablePiece[]) =>
  pieces.filter(
    (piece) =>
      piece.kind === 'card' &&
      piece.items.length === 1 &&
      !piece.stackKey?.startsWith('prediction:') &&
      !NOT_BATTLE_CARDS.has(piece.items[0]?.artwork?.type ?? '')
  );

export const capableFaces = (plan: BattlePlan) => plan.faces.filter((face) => face.capable);

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
  return { troops: withTroops(plan, faceId, { undialed: Math.max(0, total), dialed: 0 }) };
}

/** Everything the plan could spend: the reserve and what the plan already holds. */
export const availableSpice = (plan: BattlePlan, balance: number) => balance + plan.spice;

/** The spice that would support every troop in Max mode, within what the viewer has. */
export function fullSupport(plan: BattlePlan, balance: number) {
  const wanted = capableFaces(plan).reduce((total, face) => total + totalOf(plan, face.id) * face.supportCost, 0);
  return Math.min(wanted, availableSpice(plan, balance));
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

export function troopLimitOf(props: Pick<BattlePlanViewProps, 'troopLimit'>, faceId: string) {
  return props.troopLimit?.[faceId] ?? DEFAULT_TROOP_LIMIT;
}

export function toggleCard(plan: BattlePlan, cardId: string): Partial<BattlePlanInput> {
  return {
    cardIds: plan.cardIds.includes(cardId) ? plan.cardIds.filter((id) => id !== cardId) : [...plan.cardIds, cardId],
  };
}

export function toggleLeader(plan: BattlePlan, leaderId: string): Partial<BattlePlanInput> {
  return { leaderId: plan.leaderId === leaderId ? null : leaderId };
}

/** What the window may change: anything before Ready, and the dial only while it is not shown to everyone. */
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

/** The plan's leader's printed strength, when known. */
export function leaderStrengthOf(props: Pick<BattlePlanViewProps, 'plan' | 'leaderStrength'>) {
  const id = props.plan.leaderId;
  return id ? props.leaderStrength?.[id] : undefined;
}

/** The plan's whole strength: its troops and adjustment, and its leader where the leader's strength is known. */
export function totalStrength(props: Pick<BattlePlanViewProps, 'plan' | 'leaderStrength'>) {
  return props.plan.strength + (leaderStrengthOf(props) ?? 0);
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
