import { z } from 'zod';

import { factionTokenFaceUp } from './factionToken';
import type { TablePiece } from './model';
import type { TableRoster } from './schema';
import { tableCountSchema as count, tableIdSchema as id } from './schema';
import { stormOrder } from './stormSector';

/** How long the bidder waits on a faction before it passes for them, unless the table sets another time. */
const DEFAULT_BID_SECONDS = 15;
export const MIN_BID_SECONDS = 3;
export const MAX_BID_SECONDS = 120;
const bidSecondsSchema = z.number().int().min(MIN_BID_SECONDS).max(MAX_BID_SECONDS);

/**
 * The bidder over the board during the Bidding phase (#1007): it points at one faction, which raises or passes.
 * `idle` waits for the first round, `open` runs a round, and `won` or `unclaimed` shows how the last round went until players start the next one.
 * Players start every round;
 * the bidder knows nothing of cards.
 */
export const biddingStateSchema = z.object({
  seconds: bidSecondsSchema,
  stage: z.enum(['idle', 'open', 'won', 'unclaimed']),
  /* The bidding round this phase, from 1; 0 before the first. */
  round: count,
  opener: id.nullable(),
  turn: id.nullable(),
  bid: z.object({ factionId: id, amount: count.min(1) }).nullable(),
  /* Passes in a row since the round opened or since its last raise. */
  passes: count,
  deadline: count.nullable(),
});
export type BiddingState = z.infer<typeof biddingStateSchema>;

export const biddingActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('bid-open') }),
  z.strictObject({ kind: z.literal('bid-raise'), round: count }),
  z.strictObject({ kind: z.literal('bid-pass'), round: count }),
  z.strictObject({ kind: z.literal('bid-seconds'), seconds: bidSecondsSchema }),
]);
export type BiddingAction = z.infer<typeof biddingActionSchema>;
const kinds: ReadonlySet<string> = new Set(biddingActionSchema.options.map((option) => option.shape.kind.value));
export function isBiddingAction(action: { kind: string }): action is BiddingAction {
  return kinds.has(action.kind);
}

export function idleBidding(seconds = DEFAULT_BID_SECONDS): BiddingState {
  return { seconds, stage: 'idle', round: 0, opener: null, turn: null, bid: null, passes: 0, deadline: null };
}

/**
 * The factions bidding this round, in storm order: a faction sits out while its token lies face down.
 * A faction whose token is not on the table, in a game set up before tokens were dealt or while it is carried, still bids.
 */
export function biddingFactions(
  stormSectorIndex: number,
  roster: TableRoster | undefined,
  pieces: readonly TablePiece[]
): string[] {
  return stormOrder(stormSectorIndex, roster).filter((factionId) => factionTokenFaceUp(pieces, factionId));
}

/** The next faction after `from` in storm order that is still bidding; `from` itself when it is the only one. */
function nextBidder(order: readonly string[], eligible: readonly string[], from: string | null): string | null {
  if (!eligible.length) {
    return null;
  }
  const start = from === null ? -1 : order.indexOf(from);
  for (let step = 1; step <= order.length; step += 1) {
    const candidate = order[(start + step + order.length) % order.length]!;
    if (eligible.includes(candidate)) {
      return candidate;
    }
  }
  return eligible[0]!;
}

export type BiddingContext = {
  factionId: string | null;
  order: readonly string[];
  eligible: readonly string[];
  now: number;
};

export class BiddingRefusal extends Error {}
function refuse(message: string): never {
  throw new BiddingRefusal(message);
}

function open(state: BiddingState, { order, eligible, now }: BiddingContext): BiddingState {
  if (state.stage === 'open') {
    return refuse('Bidding is already open.');
  }
  /* The first round opens with the first faction in storm order, and each later round with the next one along (#1007). */
  const opener = state.opener === null ? (eligible[0] ?? null) : nextBidder(order, eligible, state.opener);
  if (opener === null) {
    return refuse('Every faction token is face down, so nobody is bidding.');
  }
  return {
    ...state,
    stage: 'open',
    round: state.round + 1,
    opener,
    turn: opener,
    bid: null,
    passes: 0,
    deadline: now + state.seconds * 1000,
  };
}

/**
 * Whether the round is over: every bidding faction but the high bidder passed since the last raise, or nobody is left to point at.
 * Counting passes rather than waiting for the bidder to come back round keeps a round from hanging when the high bidder turns its token face down mid-round.
 */
function roundEnds(state: BiddingState, next: string | null, passes: number, eligible: readonly string[]) {
  if (next === null) {
    return true;
  }
  const rivals = eligible.filter((factionId) => factionId !== state.bid?.factionId);
  return passes >= rivals.length;
}

/** Points the bidder at `next` with fresh time, or settles the round once it is over. */
function settle(
  state: BiddingState,
  next: string | null,
  passes: number,
  { eligible, now }: Omit<BiddingContext, 'factionId'>
) {
  if (!roundEnds(state, next, passes, eligible)) {
    return { ...state, turn: next, passes, deadline: now + state.seconds * 1000 };
  }
  return state.bid
    ? { ...state, stage: 'won' as const, turn: state.bid.factionId, passes, deadline: null }
    : { ...state, stage: 'unclaimed' as const, turn: null, passes, deadline: null };
}

/** Moves the bidder on from the faction it points at; the high bidder handing the bidder on after a raise is not a pass. */
function passBid(state: BiddingState, context: Omit<BiddingContext, 'factionId'>): BiddingState {
  const passes = state.turn === state.bid?.factionId ? state.passes : state.passes + 1;
  return settle(state, nextBidder(context.order, context.eligible, state.turn), passes, context);
}

/**
 * The open round after tokens flip: the bidder skips a faction that turned its token face down while it waited, without counting a pass for it, and the round ends once nobody is left to outbid the high bid.
 */
export function reconcileBidding(state: BiddingState, context: Omit<BiddingContext, 'factionId'>): BiddingState {
  if (state.stage !== 'open' || state.turn === null) {
    return state;
  }
  if (context.eligible.includes(state.turn)) {
    return roundEnds(state, state.turn, state.passes, context.eligible)
      ? settle(state, null, state.passes, context)
      : state;
  }
  return settle(state, nextBidder(context.order, context.eligible, state.turn), state.passes, context);
}

/** The raise or pass of the faction the bidder points at, refused for anyone else or a round that has ended. */
function turnAction(
  state: BiddingState,
  action: Extract<BiddingAction, { kind: 'bid-raise' | 'bid-pass' }>,
  context: BiddingContext
): BiddingState {
  if (state.stage !== 'open' || action.round !== state.round) {
    return refuse('That bidding round has ended.');
  }
  const { factionId } = context;
  if (factionId === null || factionId !== state.turn) {
    return refuse('Wait until the bidder points at your faction.');
  }
  if (action.kind === 'bid-pass') {
    return passBid(state, context);
  }
  if (!context.eligible.includes(factionId)) {
    return refuse('Turn your faction token face up to bid.');
  }
  return {
    ...state,
    bid: { factionId, amount: (state.bid?.amount ?? 0) + 1 },
    passes: 0,
    deadline: context.now + state.seconds * 1000,
  };
}

/** The bidder after one command; the Worker supplies who acts, the storm order and which tokens are up. */
export function applyBidding(state: BiddingState, action: BiddingAction, context: BiddingContext): BiddingState {
  switch (action.kind) {
    case 'bid-seconds':
      return { ...state, seconds: action.seconds };
    case 'bid-open':
      return open(state, context);
    default:
      return turnAction(state, action, context);
  }
}

/** The pass the bidder makes for a faction that let its time run out, or nothing while time remains. */
export function expireBid(state: BiddingState, context: Omit<BiddingContext, 'factionId'>): BiddingState | undefined {
  if (state.stage !== 'open' || state.deadline === null) {
    return;
  }
  return context.now < state.deadline ? undefined : passBid(state, context);
}
