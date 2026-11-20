/*
 * A bidding round played locally for the bidding prototypes (#2983): the viewer and four other factions, which bid on their own.
 * Only the stories use it; the table's real round lives in `@shared/play/bidding`.
 */

export type PrototypeBid = { factionId: string; amount: number };

export type PrototypeRound = {
  order: readonly string[];
  /* The faction the bidder points at, or null once the round is over. */
  turn: string | null;
  bid: PrototypeBid | null;
  passed: readonly string[];
  /* When the turn's clock runs out, in `performance.now()` time. */
  deadline: number;
  /* The bid as it stood when the bidder came to the viewer, which today's "take back" lowers to. */
  turnStartBid: PrototypeBid | null;
  /* The most each other faction is willing to pay for this card. */
  limits: Readonly<Record<string, number>>;
  card: number;
  /* What the bidder did for the viewer last, for a short note under the disc. */
  note: string | null;
};

export const TURN_MS = 20_000;
export const VIEWER = 'house-harkonnen';
export const PROTOTYPE_ORDER = ['house-atreides', 'fremen', VIEWER, 'spacing-guild', 'bene-gesserit'] as const;

/* The limits are seeded from the card number, so a story replays the same table every time. */
function limitsFor(card: number) {
  return Object.fromEntries(
    PROTOTYPE_ORDER.filter((faction) => faction !== VIEWER).map((faction, index) => [
      faction,
      1 + ((card * 7 + index * 5) % 9),
    ])
  );
}

export function openRound(card: number, now: number): PrototypeRound {
  const opener = PROTOTYPE_ORDER[card % PROTOTYPE_ORDER.length]!;
  return {
    order: PROTOTYPE_ORDER,
    turn: opener,
    bid: null,
    passed: [],
    deadline: now + TURN_MS,
    turnStartBid: null,
    limits: limitsFor(card),
    card,
    note: null,
  };
}

function nextTurn(round: PrototypeRound, from: string, passed: readonly string[], bid: PrototypeBid | null) {
  const start = round.order.indexOf(from);
  for (let step = 1; step <= round.order.length; step += 1) {
    const faction = round.order[(start + step) % round.order.length]!;
    if (!passed.includes(faction) && faction !== bid?.factionId) {
      return faction;
    }
  }
  return null;
}

function moveOn(round: PrototypeRound, passed: readonly string[], bid: PrototypeBid | null, now: number) {
  const everyoneElsePassed = round.order.every((faction) => faction === bid?.factionId || passed.includes(faction));
  const turn = everyoneElsePassed ? null : nextTurn(round, round.turn!, passed, bid);
  return { ...round, turn, passed, bid, deadline: now + TURN_MS, turnStartBid: bid };
}

/** A bid of the given amount, which hands the bidder on at once. */
export function bidTo(round: PrototypeRound, amount: number, now: number): PrototypeRound {
  if (!round.turn || amount <= (round.bid?.amount ?? 0)) {
    return round;
  }
  return moveOn(round, [], { factionId: round.turn, amount }, now);
}

export function pass(round: PrototypeRound, now: number, note: string | null = null): PrototypeRound {
  if (!round.turn) {
    return round;
  }
  const passed = round.turn === round.bid?.factionId ? round.passed : [...round.passed, round.turn];
  return { ...moveOn(round, passed, round.bid, now), note };
}

/* Today's bidder: a raise adds one and keeps the bidder on the viewer, until they hand it on. */
export function raiseOne(round: PrototypeRound): PrototypeRound {
  if (!round.turn) {
    return round;
  }
  return { ...round, bid: { factionId: round.turn, amount: (round.bid?.amount ?? 0) + 1 }, passed: [] };
}

export function lowerOne(round: PrototypeRound): PrototypeRound {
  if (!round.turn || round.bid?.factionId !== round.turn) {
    return round;
  }
  const amount = round.bid.amount - 1;
  const floor = round.turnStartBid?.amount ?? 0;
  if (amount <= floor) {
    return { ...round, bid: round.turnStartBid };
  }
  return { ...round, bid: { ...round.bid, amount } };
}

/** Today's hand-on: after a raise it is not a pass. */
export function handOn(round: PrototypeRound, now: number): PrototypeRound {
  return pass(round, now);
}

/** What another faction does on its turn: outbid by one or two while under its limit, else pass. */
export function otherFactionActs(round: PrototypeRound, now: number): PrototypeRound {
  const faction = round.turn;
  if (!faction || faction === VIEWER) {
    return round;
  }
  const high = round.bid?.amount ?? 0;
  const limit = round.limits[faction] ?? 0;
  if (high >= limit) {
    return pass(round, now);
  }
  const jump = (round.card + high + faction.length) % 3 === 0 ? 2 : 1;
  return bidTo(round, Math.min(limit, high + jump), now);
}

/** How long another faction thinks before acting, so the round can be followed by eye. */
export function thinkingMs(round: PrototypeRound) {
  return 900 + (((round.bid?.amount ?? 0) * 3 + (round.turn?.length ?? 0)) % 4) * 350;
}
