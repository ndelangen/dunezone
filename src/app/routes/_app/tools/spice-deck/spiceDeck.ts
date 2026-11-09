/*
 * The spice deck tool's game: a spice deck run for a table that plays with everything but the cards.
 * It follows the rulebook's Spice Blow: each turn turns over a card for every discard pile in order (A, then B),
 * for every discard pile the table plays with (the rulebook's A and B), drawing again past every Shai-Hulud until a spice card lands. On the first turn a Shai-Hulud is set aside and shuffled
 * back once the Spice Blow is over; from the second turn on it devours the territory of the spice card below it on its
 * pile, and a Nexus follows the Spice Blow. An empty deck is made again from all the discard piles, shuffled.
 * Pure and serialisable: the page keeps it in the browser's own storage, and every step is undoable.
 */

/** One card of the deck as the ruleset defines it, with how many copies the deck holds. */
export type SpiceCardDef = Readonly<{
  key: string;
  name: string;
  /** The spice it blows; none for Shai-Hulud, which names no territory. */
  amount?: number;
  /** The card's face. */
  face?: string;
  count: number;
}>;

export type SpiceDeckDef = Readonly<{
  id: string;
  name: string;
  /** The ruleset the deck ships with, as the picker names it. */
  ruleset?: string;
  back?: string;
  cards: readonly SpiceCardDef[];
}>;

/** One card turned over, and what it did. */
export type Reveal = Readonly<
  | { card: string; kind: 'spice' }
  /** Shai-Hulud on the first turn, set aside to be shuffled back. */
  | { card: string; kind: 'set-aside' }
  /** A Shai-Hulud past the ruleset's limit for one Spice Blow, ignored and shuffled back, as the Dreamrules card says. */
  | { card: string; kind: 'ignored' }
  /** Shai-Hulud from the second turn on: `devours` is the card whose territory it eats, when the pile had one. */
  | { card: string; kind: 'worm'; devours?: string }
  /** The deck ran out and the discard piles were shuffled into a new one before this card. */
  | { card: null; kind: 'reshuffle' }
>;

/** One discard pile's blow in one turn: the cards turned over for it, in order. */
export type Blow = Readonly<{ turn: number; pile: number; reveals: readonly Reveal[] }>;

export type SpiceDeckGame = Readonly<{
  version: 1;
  deck: SpiceDeckDef;
  /** Discard piles, and so blows, per turn: the rulebook's A and B, or as many as the table plays with. */
  piles: number;
  /** How many Shai-Huluds count in one Spice Blow; any more are ignored and shuffled back. None means all count. */
  wormsPerPhase?: number;
  turn: number;
  /** The pile a card was last turned onto. */
  pile: number;
  /** Card copies face down, the top last. A copy is `<key>#<n>`. */
  draw: readonly string[];
  discards: readonly (readonly string[])[];
  /** Shai-Huluds set aside this turn (first turn, or past the limit), shuffled back as the turn ends. */
  setAside: readonly string[];
  /** Every blow so far, oldest first. The last may be under way when cards are turned one at a time. */
  blows: readonly Blow[];
}>;

export type Random = () => number;

/** The most discard piles a table can ask for; more than the deck has spice cards for a few turns would make no game. */
export const MOST_PILES = 6;

/** A pile's name, A, B, C and on, as the rulebook names its two. */
export const pileLetter = (pile: number) => String.fromCodePoint(65 + pile);

export const copyKey = (copy: string) => copy.slice(0, copy.lastIndexOf('#'));

export function cardOf(game: SpiceDeckGame, copy: string): SpiceCardDef {
  const key = copyKey(copy);
  return game.deck.cards.find((card) => card.key === key)!;
}

export const isWorm = (card: SpiceCardDef) => card.amount === undefined;

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export type SpiceRules = Readonly<{ piles: number; wormsPerPhase?: number }>;

export function newGame(deck: SpiceDeckDef, random: Random, rules: SpiceRules = { piles: 1 }): SpiceDeckGame {
  const { piles, wormsPerPhase } = rules;
  const copies = deck.cards.flatMap((card) => Array.from({ length: card.count }, (_, n) => `${card.key}#${n + 1}`));
  return {
    version: 1,
    deck,
    piles,
    ...(wormsPerPhase === undefined ? {} : { wormsPerPhase }),
    turn: 1,
    pile: 0,
    draw: shuffled(copies, random),
    discards: Array.from({ length: piles }, () => []),
    setAside: [],
    blows: [],
  };
}

/** The spice card a Shai-Hulud on this pile would devour: the newest spice card under any Shai-Hulud on top. */
function territoryUnder(game: SpiceDeckGame, pile: readonly string[]): string | undefined {
  for (let i = pile.length - 1; i >= 0; i--) {
    if (!isWorm(cardOf(game, pile[i]!))) {
      return pile[i];
    }
  }
  return undefined;
}

/* The Shai-Huluds that counted in this turn's Spice Blow so far. */
const wormsThisPhase = (game: SpiceDeckGame) =>
  game.blows
    .filter((blow) => blow.turn === game.turn)
    .flatMap((blow) => blow.reveals)
    .filter((reveal) => reveal.kind === 'worm' || reveal.kind === 'set-aside').length;

/** A pile's blow this turn that has not yet landed a spice card: the one a further card on that pile adds to. */
export function openBlow(game: SpiceDeckGame, pile: number): Blow | undefined {
  const last = game.blows.findLast((blow) => blow.turn === game.turn && blow.pile === pile);
  return last && last.reveals.at(-1)?.kind !== 'spice' ? last : undefined;
}

/** Whether a pile has landed a spice card this turn. */
export const pileBlown = (game: SpiceDeckGame, pile: number) =>
  game.blows.some((blow) => blow.turn === game.turn && blow.pile === pile && blow.reveals.at(-1)?.kind === 'spice');

/** The first pile not yet blown this turn, the one the rulebook's order turns next; none once every pile has. */
export function nextPile(game: SpiceDeckGame): number | undefined {
  const pile = Array.from({ length: game.piles }, (_, index) => index).find((index) => !pileBlown(game, index));
  return pile;
}

export const spiceBlowOver = (game: SpiceDeckGame) => nextPile(game) === undefined;

/** Whether the deck can turn a card at all: a deck of only set-aside Shai-Huluds and nothing to reshuffle cannot. */
export const canReveal = (game: SpiceDeckGame) => game.draw.length > 0 || game.discards.some((pile) => pile.length > 0);

/**
 * Turns over the top card onto a pile the players chose, whatever the card.
 * The tool never draws on by itself: after a Shai-Hulud the players turn the next card when they are ready.
 * On the first turn, and past the ruleset's limit, a Shai-Hulud is set aside, to be shuffled back when the turn ends.
 */
export function revealOne(game: SpiceDeckGame, random: Random, pileIndex = nextPile(game) ?? 0): SpiceDeckGame {
  if (!canReveal(game) || pileIndex < 0 || pileIndex >= game.piles) {
    return game;
  }
  const open = openBlow(game, pileIndex);
  const reveals: Reveal[] = [...(open?.reveals ?? [])];
  let draw = [...game.draw];
  let discards = game.discards.map((pile) => [...pile]);
  if (draw.length === 0) {
    draw = shuffled(discards.flat(), random);
    discards = discards.map(() => []);
    reveals.push({ card: null, kind: 'reshuffle' });
  }
  const copy = draw.pop()!;
  const card = cardOf(game, copy);
  const pile = discards[pileIndex]!;
  let setAside = game.setAside;
  if (!isWorm(card)) {
    pile.push(copy);
    reveals.push({ card: copy, kind: 'spice' });
  } else if (game.wormsPerPhase !== undefined && wormsThisPhase(game) >= game.wormsPerPhase) {
    setAside = [...setAside, copy];
    reveals.push({ card: copy, kind: 'ignored' });
  } else if (game.turn === 1) {
    setAside = [...setAside, copy];
    reveals.push({ card: copy, kind: 'set-aside' });
  } else {
    const devours = territoryUnder(game, pile);
    pile.push(copy);
    reveals.push(devours ? { card: copy, kind: 'worm', devours } : { card: copy, kind: 'worm' });
  }
  const blow: Blow = { turn: game.turn, pile: pileIndex, reveals };
  const blows = open ? game.blows.map((entry) => (entry === open ? blow : entry)) : [...game.blows, blow];
  return { ...game, draw, discards, setAside, blows, pile: pileIndex };
}

/** One whole blow: cards turned onto a pile until a spice card lands. */
export function blowPile(game: SpiceDeckGame, random: Random, pile = nextPile(game) ?? 0): SpiceDeckGame {
  let next = game;
  do {
    next = revealOne(next, random, pile);
  } while (canReveal(next) && !pileBlown(next, pile));
  return next;
}

/** The whole Spice Blow: every pile still to blow this turn, in order. */
export function blowAll(game: SpiceDeckGame, random: Random): SpiceDeckGame {
  let next = game;
  for (let pile = nextPile(next); pile !== undefined && canReveal(next); pile = nextPile(next)) {
    next = blowPile(next, random, pile);
  }
  return next;
}

/** On to the next turn; any Shai-Hulud set aside this turn is shuffled back into the deck first. */
export function nextTurn(game: SpiceDeckGame, random: Random): SpiceDeckGame {
  const draw = game.setAside.length > 0 ? shuffled([...game.draw, ...game.setAside], random) : game.draw;
  return { ...game, draw, setAside: [], turn: game.turn + 1, pile: 0 };
}

/** Whether a Nexus follows this turn's Spice Blow: a Shai-Hulud came up after the first turn. */
export const nexus = (game: SpiceDeckGame, turn = game.turn) =>
  turn > 1 && game.blows.some((blow) => blow.turn === turn && blow.reveals.some((reveal) => reveal.kind === 'worm'));

export const blowsOfTurn = (game: SpiceDeckGame, turn = game.turn) => game.blows.filter((blow) => blow.turn === turn);

/** The spice card a blow ended on, once it has. */
export function landed(game: SpiceDeckGame, blow: Blow): SpiceCardDef | undefined {
  const last = blow.reveals.at(-1);
  return last?.kind === 'spice' ? cardOf(game, last.card) : undefined;
}

/** What is left face down, by card, with the chance each comes up next. */
export function remaining(game: SpiceDeckGame): { card: SpiceCardDef; left: number }[] {
  const left = new Map<string, number>();
  for (const copy of game.draw) {
    left.set(copyKey(copy), (left.get(copyKey(copy)) ?? 0) + 1);
  }
  return game.deck.cards.map((card) => ({ card, left: left.get(card.key) ?? 0 }));
}

/** The chance the next card is Shai-Hulud, from the cards still face down; reshuffles are not foreseen. */
export function wormChance(game: SpiceDeckGame): number {
  if (game.draw.length === 0) {
    return 0;
  }
  const worms = game.draw.filter((copy) => isWorm(cardOf(game, copy))).length;
  return worms / game.draw.length;
}

/** One turned card as a sentence for the table, as the voice reads it. */
export function revealSentence(game: SpiceDeckGame, reveal: Reveal): string {
  if (reveal.kind === 'reshuffle') {
    return 'The deck ran out, so the spice piles are shuffled into a new deck.';
  }
  const card = cardOf(game, reveal.card);
  if (reveal.kind === 'ignored') {
    return 'Another Shai-Hulud: one too many this turn, so it is set aside and goes back into the deck.';
  }
  if (reveal.kind === 'set-aside') {
    return 'Shai-Hulud on the first turn: set aside, it goes back into the deck.';
  }
  if (reveal.kind === 'worm') {
    return reveal.devours
      ? `Shai-Hulud! It devours everything in ${cardOf(game, reveal.devours).name}.`
      : 'Shai-Hulud, with no territory beneath it to devour.';
  }
  return `${card.amount} spice in ${card.name}.`;
}

/** A blow as a sentence for the table. */
export function blowSentence(game: SpiceDeckGame, blow: Blow): string {
  const parts = blow.reveals.map((reveal) => revealSentence(game, reveal));
  return `Spice pile ${game.piles > 1 ? pileLetter(blow.pile) : ''}: ${parts.join(' ')}`.replace(' :', ':');
}
