import decks from '@shared/play/fixtures/dreamrulesDecks.json';

import { blowAll, newGame, nextTurn } from './spiceDeck';
import type { SpiceDeckDef, SpiceDeckGame } from './spiceDeck';
import type { SpiceDeckChoice } from './spiceDeckSupply';

const href = (path: string) => new URL(path, location.origin).href;

const cards = decks.spice.cards.map((card) => ({
  key: card.file.replace(/\.jpg$/, ''),
  name: card.name,
  count: card.count,
  face: href(`/play-fixtures/dreamrules/${card.file}`),
  ...('amount' in card && typeof card.amount === 'number' ? { amount: card.amount } : {}),
}));

/** The Dreamrules Spice deck as dune.zone publishes it: the base game's cards, Shai-Hulud ×6 and five spice mines. */
export const DREAMRULES_SPICE: SpiceDeckDef = {
  id: decks.spice.id,
  name: decks.spice.name,
  ruleset: 'Dreamrules',
  back: href(`/play-fixtures/dreamrules/${decks.spice.back.file}`),
  cards,
};

/** The base game's 21 cards: 15 territories and Shai-Hulud ×6, as the GF9 and KISS decks hold them. */
export const BASE_SPICE: SpiceDeckDef = {
  id: 'base-spice',
  name: 'GF9 Spice Deck',
  ruleset: 'GF9',
  back: DREAMRULES_SPICE.back,
  cards: cards.slice(0, 16),
};

const STORY_DECK_DEFS: readonly SpiceDeckDef[] = [
  { ...DREAMRULES_SPICE, id: 'dreamrules' },
  { ...BASE_SPICE, id: 'gf9' },
  { ...BASE_SPICE, id: 'kiss', name: 'KISS Spice Deck', ruleset: 'KISS' },
];

/** The rulesets' spice decks as the picker lists them, by ruleset name. */
export const STORY_DECKS: readonly SpiceDeckChoice[] = STORY_DECK_DEFS.map(({ id, name, ruleset }) => ({
  id,
  name,
  ruleset: ruleset!,
}));

/** Reads a picked deck's cards, as the page reads them from the catalogue. */
export const loadStoryDeck = async (choice: SpiceDeckChoice) => STORY_DECK_DEFS.find((deck) => deck.id === choice.id)!;

/** A repeatable shuffle, so every story shows the same game. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A game played through the given turns' Spice Blows, every pile in order; `andNext` moves on to the next turn. */
export function storyGame(
  turns: number,
  { piles = 2, peek = 1, andNext = false, seed = STORY_SEED, deck = BASE_SPICE } = {}
): SpiceDeckGame {
  const random = seeded(seed);
  let game = newGame(deck, random, { piles, peek });
  for (let turn = 1; turn <= turns; turn++) {
    game = blowAll(turn === 1 ? game : nextTurn(game, random), random);
  }
  return andNext ? nextTurn(game, random) : game;
}

/* A seed whose third turn brings Shai-Hulud on both piles, so the stories show worms and a Nexus. */
export const STORY_SEED = 2;
