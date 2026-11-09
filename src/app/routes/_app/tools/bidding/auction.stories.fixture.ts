import type { FactionToken } from '@app/routes/_app/play/multiplayer/FactionTokenFace';

import { bid, DEFAULT_LIMIT, newAuction, pass } from './auction';
import type { AuctionGame, AuctionSeat } from './auction';

const href = (path: string) => new URL(path, location.origin).href;

const token = (id: string, name: string, color: string): FactionToken => ({
  id,
  name,
  color,
  src: href(`/play-fixtures/product/${id}-token.jpg`),
});

/** The base game's six factions, in storm order from the first player. */
export const STORY_FACTIONS: readonly FactionToken[] = [
  token('house-atreides', 'House Atreides', '#4a4c08'),
  token('house-harkonnen', 'House Harkonnen', '#151315'),
  token('emperor', 'Emperor', '#be1010'),
  token('spacing-guild', 'Spacing Guild', '#dc5317'),
  token('fremen', 'Fremen', '#e4942e'),
  token('bene-gesserit', 'Bene Gesserit', '#253b82'),
];

export const STORY_DECK = { name: 'Dreamrules Treachery deck', back: href('/play-fixtures/dreamrules/cardback.jpg') };

/** The six seats as the base game deals them: everyone holds one card, Harkonnen two; Harkonnen holds eight and draws a bonus card, Atreides peeks, the Emperor is paid. */
export function storySeats(): AuctionSeat[] {
  return STORY_FACTIONS.map((faction) => ({
    faction,
    hand: faction.id === 'house-harkonnen' ? 2 : faction.id === 'emperor' ? 4 : 1,
    limit: faction.id === 'house-harkonnen' ? 8 : DEFAULT_LIMIT,
    ...(faction.id === 'house-harkonnen' ? { bonus: true } : {}),
    ...(faction.id === 'house-atreides' ? { peeks: true } : {}),
    ...(faction.id === 'emperor' ? { paid: true } : {}),
  }));
}

/**
 * Turn 2's Bidding phase, mid-auction: the Emperor's hand is full, so five cards came up.
 * Harkonnen won the first for 3 (and drew its bonus card);
 * on the second, Fremen bid 2 and the Guild has the floor.
 */
export function midAuction(): AuctionGame {
  let game = newAuction(STORY_DECK, storySeats(), 2);
  game = bid(game, 1);
  game = bid(game, 3);
  game = pass(game);
  game = pass(game);
  game = pass(game);
  game = pass(game);
  game = pass(game);
  game = pass(game);
  game = bid(game, 2);
  game = pass(game);
  game = pass(game);
  game = pass(game);
  return game;
}

/** A fresh turn: the first card is up and Atreides opens. */
export function freshAuction(): AuctionGame {
  return newAuction(STORY_DECK, storySeats(), 2);
}
