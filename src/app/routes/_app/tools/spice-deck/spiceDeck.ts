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
  /** The pile whose blow is next this turn; equal to `piles` once the turn's Spice Blow is over. */
  pile: number;
  /** Card copies face down, the top last. A copy is `<key>#<n>`. */
  draw: readonly string[];
  discards: readonly (readonly string[])[];
  /** Shai-Huluds set aside this Spice Blow (first turn, or past the limit), waiting to be shuffled back. */
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

/** The blow under way: the current pile's, this turn, once its first card is turned. */
export function currentBlow(game: SpiceDeckGame): Blow | undefined {
  const last = game.blows.at(-1);
  return last && last.turn === game.turn && last.pile === game.pile ? last : undefined;
}

export const spiceBlowOver = (game: SpiceDeckGame) => game.pile >= game.piles;

/** Whether the deck can turn a card at all: a deck of only set-aside Shai-Huluds and nothing to reshuffle cannot. */
export const canReveal = (game: SpiceDeckGame) =>
  !spiceBlowOver(game) && (game.draw.length > 0 || game.discards.some((pile) => pile.length > 0));

/**
 * Turns over one card for the current pile.
 * A spice card ends that pile's blow;
 * a Shai-Hulud asks for another.
 * Once the last pile's blow ends on the first turn, the set-aside Shai-Huluds are shuffled back.
 */
export function revealOne(game: SpiceDeckGame, random: Random): SpiceDeckGame {
  if (!canReveal(game)) {
    return game;
  }
  const reveals: Reveal[] = [...(currentBlow(game)?.reveals ?? [])];
  let draw = [...game.draw];
  let discards = game.discards.map((pile) => [...pile]);
  if (draw.length === 0) {
    draw = shuffled(discards.flat(), random);
    discards = discards.map(() => []);
    reveals.push({ card: null, kind: 'reshuffle' });
  }
  const copy = draw.pop()!;
  const card = cardOf(game, copy);
  const pile = discards[game.pile]!;
  let setAside = game.setAside;
  let pileNext = game.pile;
  if (!isWorm(card)) {
    pile.push(copy);
    reveals.push({ card: copy, kind: 'spice' });
    pileNext += 1;
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
  const blow: Blow = { turn: game.turn, pile: game.pile, reveals };
  const blows = currentBlow(game) ? [...game.blows.slice(0, -1), blow] : [...game.blows, blow];
  if (pileNext >= game.piles && setAside.length > 0) {
    draw = shuffled([...draw, ...setAside], random);
    setAside = [];
  }
  return { ...game, draw, discards, setAside, blows, pile: pileNext };
}

/** One whole blow: cards turned for the current pile until a spice card lands. */
export function blowPile(game: SpiceDeckGame, random: Random): SpiceDeckGame {
  let next = game;
  const pile = game.pile;
  while (next.pile === pile && canReveal(next)) {
    next = revealOne(next, random);
  }
  return next;
}

/** The whole Spice Blow: every pile still to blow this turn. */
export function blowAll(game: SpiceDeckGame, random: Random): SpiceDeckGame {
  let next = game;
  while (canReveal(next)) {
    next = blowPile(next, random);
  }
  return next;
}

export function nextTurn(game: SpiceDeckGame): SpiceDeckGame {
  return { ...game, turn: game.turn + 1, pile: 0 };
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

/** A blow as a sentence for the table, as the voice reads it. */
export function blowSentence(game: SpiceDeckGame, blow: Blow): string {
  const parts = blow.reveals.map((reveal) => {
    if (reveal.kind === 'reshuffle') {
      return 'The deck ran out, so the spice piles are shuffled into a new deck.';
    }
    const card = cardOf(game, reveal.card);
    if (reveal.kind === 'ignored') {
      return 'Another Shai-Hulud: one too many this Spice Blow, so it is ignored and goes back into the deck.';
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
  });
  return `Spice pile ${game.piles > 1 ? pileLetter(blow.pile) : ''}: ${parts.join(' ')}`.replace(' :', ':');
}
