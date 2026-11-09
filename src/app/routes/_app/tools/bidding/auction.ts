import { applyBidding, BiddingRefusal, idleBidding } from '@shared/play/bidding';
import type { BiddingAction, BiddingContext, BiddingState } from '@shared/play/bidding';

import type { FactionToken } from '@app/routes/_app/play/multiplayer/FactionTokenFace';

/*
 * The Bidding phase at a real table, run by a phone or a tablet: the cards are physical, the auctioneer is digital.
 * It knows the rulebook's auction: as many cards come up as there are factions with room in hand, bidding goes round
 * in storm order, each next card opens one seat further on, the winner pays the Emperor (or the bank), a faction with a
 * bonus card draws it, and a card nobody bids on ends the phase, the rest going back on the deck.
 * The rounds themselves are Play's own bidder (@shared/play/bidding), so a raise, a pass and the end of a round work
 * exactly as they do online; a jump to any amount is that bidder's raises one spice at a time, then handing it on.
 */

export type AuctionSeat = Readonly<{
  faction: FactionToken;
  /** Treachery cards in hand now. */
  hand: number;
  /** The most it may hold: 4 for most, 8 for Harkonnen. */
  limit: number;
  /** Draws an extra card from the deck with every card it wins, while it has room (Harkonnen). */
  bonus?: boolean;
  /** Looks at each card before it is bid on (Atreides). */
  peeks?: boolean;
  /** Receives the spice paid for cards (Emperor); without one the bank does. */
  paid?: boolean;
}>;

/** How one card went. */
export type AuctionResult = Readonly<{
  /** The card's place in this turn's auction, from 0. */
  card: number;
  /** The winner, or null when every faction passed. */
  faction: string | null;
  amount: number;
  /** Whether the winner also drew its bonus card. */
  bonus: boolean;
}>;

export type AuctionGame = Readonly<{
  version: 1;
  /** The Treachery deck's back, for the card up for bid. */
  deck: Readonly<{ name: string; back: string }>;
  /** The table in storm order: the first seat opens the turn's first card. */
  seats: readonly AuctionSeat[];
  turn: number;
  /** How many cards came up this turn. */
  cards: number;
  /** The card up for bid now, from 0; equal to `cards` once the phase is over. */
  card: number;
  /** The seat that opened bidding on the current card. */
  opener: string | null;
  bidding: BiddingState;
  results: readonly AuctionResult[];
  /** Cards put back on the deck when every faction passed on one. */
  returned: number;
}>;

export const DEFAULT_LIMIT = 4;

const idOf = (seat: AuctionSeat) => seat.faction.id;
const hasRoom = (seat: AuctionSeat) => seat.hand < seat.limit;

export function seatOf(game: AuctionGame, factionId: string | null): AuctionSeat | undefined {
  return game.seats.find((seat) => idOf(seat) === factionId);
}

/** The factions that may bid: those with room in hand, in storm order. */
export function bidders(game: AuctionGame): string[] {
  return game.seats.filter(hasRoom).map(idOf);
}

function context(game: AuctionGame, factionId: string | null): BiddingContext {
  return { factionId, order: game.seats.map(idOf), eligible: bidders(game), now: Date.now() };
}

/** The first seat with room at or after `from` in storm order. */
function openerFrom(game: AuctionGame, from: number): string | null {
  for (let step = 0; step < game.seats.length; step++) {
    const seat = game.seats[(from + step) % game.seats.length]!;
    if (hasRoom(seat)) {
      return idOf(seat);
    }
  }
  return null;
}

function openCard(game: AuctionGame, opener: string | null): AuctionGame {
  if (game.card >= game.cards || opener === null) {
    return { ...game, card: game.cards, opener: null, bidding: { ...idleBidding(), round: game.bidding.round } };
  }
  const bidding = applyBidding(game.bidding, { kind: 'bid-start', factionId: opener }, context(game, opener));
  return { ...game, opener, bidding };
}

/** A new auction for the table: the first turn's Bidding phase, before anything is bid. */
export function newAuction(deck: AuctionGame['deck'], seats: readonly AuctionSeat[], turn = 1): AuctionGame {
  const base: AuctionGame = {
    version: 1,
    deck,
    seats,
    turn,
    cards: 0,
    card: 0,
    opener: null,
    bidding: idleBidding(),
    results: [],
    returned: 0,
  };
  return startPhase(base, turn);
}

/** A turn's Bidding phase: one card for each faction with room in hand, the first opened by the first such seat. */
export function startPhase(game: AuctionGame, turn = game.turn + 1): AuctionGame {
  const cards = game.seats.filter(hasRoom).length;
  const fresh: AuctionGame = { ...game, turn, cards, card: 0, results: [], returned: 0 };
  return openCard(fresh, openerFrom(fresh, 0));
}

export function phaseOver(game: AuctionGame): boolean {
  return game.card >= game.cards;
}

/** The faction whose bid it is, or null between cards. */
export function toBid(game: AuctionGame): string | null {
  return game.bidding.stage === 'open' ? game.bidding.turn : null;
}

export function highBid(game: AuctionGame): BiddingState['bid'] {
  return game.bidding.stage === 'open' ? game.bidding.bid : null;
}

/** The least the faction to bid may say: one more than the bid it must beat. */
export function leastBid(game: AuctionGame): number {
  return (highBid(game)?.amount ?? 0) + 1;
}

function act(game: AuctionGame, action: BiddingAction, factionId: string | null): AuctionGame {
  return { ...game, bidding: applyBidding(game.bidding, action, context(game, factionId)) };
}

/* A finished round: the winner takes the card (and its bonus card), and the next card opens one seat on. */
function settle(game: AuctionGame): AuctionGame {
  const { bidding } = game;
  if (bidding.stage === 'unclaimed' || (bidding.stage === 'won' && !bidding.bid)) {
    const result: AuctionResult = { card: game.card, faction: null, amount: 0, bonus: false };
    return {
      ...game,
      results: [...game.results, result],
      returned: game.cards - game.card - 1,
      card: game.cards,
      opener: null,
      bidding: { ...idleBidding(), round: bidding.round },
    };
  }
  if (bidding.stage !== 'won' || !bidding.bid) {
    return game;
  }
  const { factionId, amount } = bidding.bid;
  let bonus = false;
  const seats = game.seats.map((seat) => {
    if (idOf(seat) !== factionId) {
      return seat;
    }
    const hand = seat.hand + 1;
    bonus = Boolean(seat.bonus) && hand < seat.limit;
    return { ...seat, hand: hand + (bonus ? 1 : 0) };
  });
  const won: AuctionGame = {
    ...game,
    seats,
    results: [...game.results, { card: game.card, faction: factionId, amount, bonus }],
    card: game.card + 1,
  };
  const at = game.seats.findIndex((seat) => idOf(seat) === game.opener);
  return openCard(won, openerFrom(won, at + 1));
}

function settled(game: AuctionGame): AuctionGame {
  return game.bidding.stage === 'open' ? game : settle(game);
}

/**
 * The faction to bid says an amount: higher than the high bid, or it is refused.
 * Play's bidder raises one spice at a time, so the jump is its raises, then handing the bidder on.
 */
export function bid(game: AuctionGame, amount: number): AuctionGame {
  const turn = toBid(game);
  if (turn === null) {
    throw new BiddingRefusal('Nobody is bidding right now.');
  }
  if (amount < leastBid(game)) {
    throw new BiddingRefusal(`Bid at least ${leastBid(game)}.`);
  }
  let next = game;
  while ((highBid(next)?.amount ?? 0) < amount) {
    next = act(next, { kind: 'bid-raise', round: next.bidding.round }, turn);
  }
  return settled(act(next, { kind: 'bid-pass', round: next.bidding.round }, turn));
}

/** The faction to bid passes. */
export function pass(game: AuctionGame): AuctionGame {
  const turn = toBid(game);
  if (turn === null) {
    throw new BiddingRefusal('Nobody is bidding right now.');
  }
  return settled(act(game, { kind: 'bid-pass', round: game.bidding.round }, turn));
}

/** Who is paid for a card: the Emperor when one plays, else the bank. */
export function payeeName(game: AuctionGame): string {
  return game.seats.find((seat) => seat.paid)?.faction.name ?? 'the bank';
}

/** What a result asks of the table, as one sentence for the screen and the voice. */
export function resultSentence(game: AuctionGame, result: AuctionResult): string {
  if (result.faction === null) {
    const back = game.returned;
    return back > 0
      ? `Everyone passed. Put this card and ${back === 1 ? 'the last card' : `the other ${back}`} back on the deck.`
      : 'Everyone passed. Put the card back on the deck.';
  }
  const seat = seatOf(game, result.faction)!;
  const payee = seat.paid ? 'the bank' : payeeName(game);
  const paid = `${seat.faction.name} pays ${result.amount} spice to ${payee} and takes the card.`;
  return result.bonus ? `${paid} ${seat.faction.name} also draws a free card.` : paid;
}

/** The faction's name for the voice and big captions: "Atreides" for "House Atreides". */
export function shortName(token: FactionToken): string {
  return token.name.replace(/^House\s+/i, '');
}
