import { z } from 'zod';

import { actionKindGuard } from './actionKinds';
import { factionTokenFaceUp } from './factionToken';
import type { TablePiece } from './model';
import type { TableRoster } from './schema';
import { tableCountSchema as count, tableIdSchema as id } from './schema';
import { stormOrder } from './stormSector';

/** The countdown drains for twenty seconds, then flashes once per second before passing. */
export const BID_COUNTDOWN_MS = 20_000;
export const BID_WARNING_MS = 5000;
const DEFAULT_BID_SECONDS = BID_COUNTDOWN_MS / 1000;
const MIN_BID_SECONDS = 3;
const MAX_BID_SECONDS = 120;
const bidSecondsSchema = z.number().int().min(MIN_BID_SECONDS).max(MAX_BID_SECONDS);

/**
 * The bidder over the board during the Bidding phase (#1007): it points at one faction, which raises or passes.
 * `idle` waits for the first round, `open` runs a round, and `won` or `unclaimed` shows how the last round went until players start the next one.
 * Players start every round;
 * the bidder knows nothing of cards.
 */
export const biddingStateSchema = z.object({
  /* Kept for snapshots and clients that still send the old duration setting. */
  seconds: bidSecondsSchema,
  timed: z.boolean().default(false),
  started: z.boolean().default(false),
  stage: z.enum(['idle', 'open', 'won', 'unclaimed']),
  /* The bidding round this phase, from 1; 0 before the first. */
  round: count,
  opener: id.nullable(),
  turn: id.nullable(),
  bid: z.object({ factionId: id, amount: count.min(1) }).nullable(),
  /* The factions that passed since the round opened or since its last raise. */
  passed: z.array(id),
  deadline: count.nullable(),
  /* The high bid and the passes as they stood when the bidder came to the faction it points at, which its own raises lower back to. */
  turnStart: z
    .object({ bid: z.object({ factionId: id, amount: count.min(1) }).nullable(), passed: z.array(id) })
    .optional(),
});
export type BiddingState = z.infer<typeof biddingStateSchema>;

export const biddingActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('bid-start'), factionId: id }),
  z.strictObject({ kind: z.literal('bid-reset') }),
  z.strictObject({ kind: z.literal('bid-raise'), round: count }),
  z.strictObject({ kind: z.literal('bid-pass'), round: count }),
  z.strictObject({ kind: z.literal('bid-lower'), round: count }),
  z.strictObject({ kind: z.literal('bid-seconds'), seconds: bidSecondsSchema }),
  z.strictObject({ kind: z.literal('bid-timing'), enabled: z.boolean() }),
]);
export type BiddingAction = z.infer<typeof biddingActionSchema>;
export const isBiddingAction = actionKindGuard(biddingActionSchema);

export function idleBidding(seconds = DEFAULT_BID_SECONDS, timed = false): BiddingState {
  return {
    seconds,
    timed,
    started: false,
    stage: 'idle',
    round: 0,
    opener: null,
    turn: null,
    bid: null,
    passed: [],
    deadline: null,
  };
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
  return stormOrder(stormSectorIndex, roster, pieces).filter((factionId) => factionTokenFaceUp(pieces, factionId));
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

/**
 * Starts a round on the faction the players pick, any time in the phase: a round still open is dropped, so the same choice also corrects a bidder that went wrong (#1007).
 * The round number still counts up, so a raise or pass sent for the dropped round is refused.
 */
function start(state: BiddingState, factionId: string, { eligible }: BiddingContext): BiddingState {
  if (!eligible.includes(factionId)) {
    return refuse('That faction token is face down, so it is not bidding.');
  }
  return {
    ...state,
    stage: 'open',
    round: state.round + 1,
    opener: factionId,
    turn: factionId,
    bid: null,
    passed: [],
    started: false,
    deadline: null,
    turnStart: { bid: null, passed: [] },
  };
}

/**
 * Whether the round is over: every bidding faction but the high bidder passed since the last raise, or nobody is left to point at.
 * Asking who passed rather than waiting for the bidder to come back round keeps a round from hanging when the high bidder turns its token face down mid-round, and asking who rather than how many keeps a faction that passed and then turned its token face down from ending the round before the others act.
 */
function roundEnds(state: BiddingState, next: string | null, passed: readonly string[], eligible: readonly string[]) {
  if (next === null) {
    return true;
  }
  return eligible.every((factionId) => factionId === state.bid?.factionId || passed.includes(factionId));
}

function turnDeadline(state: BiddingState, now: number): number | null {
  return state.timed && state.started ? now + BID_COUNTDOWN_MS + BID_WARNING_MS : null;
}

/** Points the bidder at `next` with fresh time, or settles the round once it is over. */
function settle(
  state: BiddingState,
  next: string | null,
  passed: string[],
  { eligible, now }: Omit<BiddingContext, 'factionId'>
) {
  if (!roundEnds(state, next, passed, eligible)) {
    return { ...state, turn: next, passed, deadline: turnDeadline(state, now), turnStart: { bid: state.bid, passed } };
  }
  return state.bid
    ? { ...state, stage: 'won' as const, turn: state.bid.factionId, passed, deadline: null }
    : { ...state, stage: 'unclaimed' as const, turn: null, passed, deadline: null };
}

/** Moves the bidder on from the faction it points at; the high bidder handing the bidder on after a raise is not a pass. */
function passBid(state: BiddingState, context: Omit<BiddingContext, 'factionId'>): BiddingState {
  const { turn } = state;
  const passed = turn === null || turn === state.bid?.factionId ? state.passed : [...state.passed, turn];
  return settle(state, nextBidder(context.order, context.eligible, turn), passed, context);
}

/**
 * The open round after tokens flip: the bidder skips a faction that turned its token face down while it waited, without counting a pass for it, and the round ends once nobody is left to outbid the high bid.
 */
export function reconcileBidding(state: BiddingState, context: Omit<BiddingContext, 'factionId'>): BiddingState {
  if (state.stage !== 'open' || state.turn === null) {
    return state;
  }
  if (context.eligible.includes(state.turn)) {
    return roundEnds(state, state.turn, state.passed, context.eligible)
      ? settle(state, null, state.passed, context)
      : state;
  }
  return settle(state, nextBidder(context.order, context.eligible, state.turn), state.passed, context);
}

/** The raise or pass of the faction the bidder points at, refused for anyone else or a round that has ended. */
function turnAction(
  state: BiddingState,
  action: Extract<BiddingAction, { kind: 'bid-raise' | 'bid-pass' | 'bid-lower' }>,
  context: BiddingContext
): BiddingState {
  if (state.stage !== 'open' || action.round !== state.round) {
    return refuse('That bidding round has ended.');
  }
  const { factionId } = context;
  if (factionId === null || factionId !== state.turn) {
    return refuse('Wait until the bidder points at your faction.');
  }
  if (action.kind === 'bid-lower') {
    return lowerBid(state, factionId);
  }
  const started = { ...state, started: true };
  return action.kind === 'bid-pass' ? passBid(started, context) : raiseBid(started, factionId, context);
}

/** Whether the faction the bidder points at raised since it came to them, so it can take a raise back. */
export function canLowerBid(state: BiddingState, factionId: string | null): boolean {
  if (state.stage !== 'open' || factionId === null || factionId !== state.turn || state.bid?.factionId !== factionId) {
    return false;
  }
  return state.bid.amount > (state.turnStart?.bid?.amount ?? 0);
}

/*
 * One spice off a bid the faction raised this turn, never below the bid it found: taking back its last raise brings back
 * the bid it outbid, and the passes that raise had cleared. The clock runs on, so lowering never buys time.
 */
function lowerBid(state: BiddingState, factionId: string): BiddingState {
  if (!canLowerBid(state, factionId)) {
    return refuse('Only a raise you made this turn can be lowered.');
  }
  const amount = state.bid!.amount - 1;
  const start = state.turnStart ?? { bid: null, passed: [] };
  if (amount <= (start.bid?.amount ?? 0)) {
    return { ...state, bid: start.bid, passed: start.passed };
  }
  return { ...state, bid: { factionId, amount } };
}

/** One more spice on the current bid, from a faction whose token is face up; every pass so far is forgotten. */
function raiseBid(state: BiddingState, factionId: string, context: BiddingContext): BiddingState {
  if (!context.eligible.includes(factionId)) {
    return refuse('Turn your faction token face up to bid.');
  }
  return {
    ...state,
    bid: { factionId, amount: (state.bid?.amount ?? 0) + 1 },
    passed: [],
    deadline: turnDeadline(state, context.now),
  };
}

/** The bidder after one command; the Worker supplies who acts, the storm order and which tokens are up. */
export function applyBidding(state: BiddingState, action: BiddingAction, context: BiddingContext): BiddingState {
  switch (action.kind) {
    case 'bid-seconds':
      return { ...state, seconds: action.seconds };
    case 'bid-timing': {
      if (state.timed === action.enabled) {
        return state;
      }
      const next = { ...state, timed: action.enabled };
      return { ...next, deadline: next.stage === 'open' ? turnDeadline(next, context.now) : null };
    }
    case 'bid-start':
      return start(state, action.factionId, context);
    case 'bid-reset':
      return { ...idleBidding(state.seconds, state.timed), round: state.round };
    default:
      return turnAction(state, action, context);
  }
}

/** The pass the bidder makes for a faction that let its time run out, or nothing while time remains. */
export function expireBid(state: BiddingState, context: Omit<BiddingContext, 'factionId'>): BiddingState | undefined {
  if (!state.timed || !state.started || state.stage !== 'open' || state.deadline === null) {
    return;
  }
  return context.now < state.deadline ? undefined : passBid(state, context);
}
