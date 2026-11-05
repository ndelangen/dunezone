/*
 * What one seat remembers of its game, kept by the harness instead of the model, so nothing it saw is forgotten:
 * a log built by comparing each view with the one before (the table itself keeps only its last 8 events), and a ledger
 * of the cards it has seen and where they went.
 *
 * Play gives a card a new id whenever it moves into or out of a hand, so no one can follow a card by id. The ledger
 * follows cards the way a person at the table would: a card it knows leaves its pile, and at that moment one faction's
 * hand grows, so that faction holds it. It reads only what this seat's own view carries.
 */
import { isFactionToken } from '../../src/shared/play/factionToken';
import type { TablePiece } from '../../src/shared/play/model';
import type { GameSnapshot } from '../../src/shared/play/protocol';

export type MemoryContext = {
  /** The faction this seat plays. */
  me: string;
  /** A faction's name as the table shows it. */
  name: (factionId: string) => string;
  /** Where a piece lies, in words: a territory, the Tanks, or off the board. */
  place: (piece: TablePiece) => string;
};

export type LogLine = { turn: number; phase: string; text: string };

/** A card this seat knows of that is not in its own hand (its hand it sees in full every time). */
export type KnownCard = {
  name: string;
  /** The faction holding it, or the factions that may, when two hands grew at once. */
  holders: string[];
  /** In words, where it is or was last seen. */
  where: string;
  /** When and how the seat learnt it, such as "peeked T2 Bidding". */
  learnt: string;
  /** While it lies in a pile: that pile's piece id and how far from the top. */
  pile?: { pieceId: string; fromTop: number; shuffles: number };
  /** Played or discarded face up: kept a while as history, no longer held. */
  gone?: boolean;
};

type Frame = {
  stage: string;
  phase: number;
  phaseLabel: string;
  events: { id: string; message: string }[];
  handCounts: Record<string, number>;
  /** Troops and leaders by owner, place and kind. */
  forces: Map<string, number>;
  pieces: Map<string, { items: number; shuffles: number; label: string }>;
  /** Names of the cards in this seat's hand, with how many of each. */
  hand: Map<string, number>;
  /** Names of face-up cards on the table. */
  faceUp: Map<string, number>;
  bidding: GameSnapshot['bidding'];
  spice: number;
};

const MAX_LOG = 500;

function cardName(item: TablePiece['items'][number], fallback: string) {
  const artwork = item.artwork;
  return artwork && 'name' in artwork && artwork.name ? String(artwork.name) : fallback;
}

function tally(names: string[]) {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/** What `after` holds more of than `before`, by name. */
function added(before: Map<string, number>, after: Map<string, number>) {
  return [...after].flatMap(([name, count]) => Array(Math.max(0, count - (before.get(name) ?? 0))).fill(name) as string[]);
}

export class SeatMemory {
  readonly log: LogLine[] = [];
  readonly cards: KnownCard[] = [];
  turn = 0;
  private last: Frame | undefined;

  constructor(private readonly context: MemoryContext) {}

  private frame(snapshot: GameSnapshot, phaseLabel: string): Frame {
    const forces = new Map<string, number>();
    const pieces = new Map<string, { items: number; shuffles: number; label: string }>();
    const faceUp: string[] = [];
    for (const piece of snapshot.table.pieces) {
      pieces.set(piece.id, { items: piece.items.length, shuffles: piece.shuffleRevision ?? 0, label: piece.label });
      if (piece.kind === 'force' && piece.owner !== 'shared' && !isFactionToken(piece) && !piece.inventory) {
        const key = `${piece.owner}\t${this.context.place(piece)}\t${piece.label}`;
        forces.set(key, (forces.get(key) ?? 0) + piece.items.length);
      }
      if (piece.kind === 'card' && !piece.inventory) {
        faceUp.push(...piece.items.filter((item) => item.faceUp && item.artwork && 'name' in item.artwork).map((item) => cardName(item, piece.label)));
      }
    }
    const hand = (snapshot.hand ?? []).filter((piece) => piece.kind === 'card').flatMap((piece) => piece.items.map((item) => cardName(item, piece.label)));
    return {
      stage: snapshot.stage ?? 'play',
      phase: snapshot.phase,
      phaseLabel,
      events: [...snapshot.table.events].reverse(),
      handCounts: { ...snapshot.handCounts },
      forces,
      pieces,
      hand: tally(hand),
      faceUp: tally(faceUp),
      bidding: snapshot.bidding,
      spice: snapshot.bank?.balance ?? 0,
    };
  }

  private write(text: string, frame: Frame) {
    this.log.push({ turn: this.turn, phase: frame.stage === 'play' ? frame.phaseLabel : frame.stage, text });
    this.log.splice(0, Math.max(0, this.log.length - MAX_LOG));
  }

  /**
   * Takes the seat's newest view and returns what changed since the last one, in words; the same lines go to the log.
   * `phaseLabel` names the snapshot's phase (the turn is composed per game, so the caller knows its labels).
   */
  observe(snapshot: GameSnapshot, phaseLabel: string): LogLine[] {
    const { me, name } = this.context;
    const start = this.log.length;
    const before = this.last;
    const now = this.frame(snapshot, phaseLabel);
    this.last = now;

    if (now.stage === 'play' && (this.turn === 0 || (before && before.stage === 'play' && now.phase < before.phase))) {
      this.turn++;
    }
    if (!before || before.stage !== now.stage || before.phase !== now.phase) {
      this.write(now.stage === 'play' ? `Turn ${this.turn}, ${now.phaseLabel} phase.` : `The game is in ${now.stage}.`, now);
    }
    if (!before) {
      this.learn(snapshot, now);
      return this.log.slice(start);
    }

    /* The table's own log, every event this view shows that the last did not. */
    const seen = new Set(before.events.map((event) => event.id));
    for (const event of now.events.filter((entry) => !seen.has(entry.id))) {
      this.write(event.message, now);
    }

    /* Hands: who gained or lost cards. */
    const grew: string[] = [];
    for (const faction of new Set([...Object.keys(before.handCounts), ...Object.keys(now.handCounts)])) {
      const was = before.handCounts[faction] ?? 0;
      const is = now.handCounts[faction] ?? 0;
      if (is > was) {
        grew.push(faction);
      }
      if (is !== was && faction !== me) {
        this.write(`${name(faction)} now holds ${is} Treachery card${is === 1 ? '' : 's'} (was ${was}).`, now);
      }
    }

    /* Troops and leaders that came or went, per owner and place. */
    for (const key of new Set([...before.forces.keys(), ...now.forces.keys()])) {
      const change = (now.forces.get(key) ?? 0) - (before.forces.get(key) ?? 0);
      if (change) {
        const [owner, place, label] = key.split('\t') as [string, string, string];
        this.write(`${owner === me ? 'Your' : `${name(owner)}'s`} ${label} in ${place}: ${change > 0 ? '+' : ''}${change}.`, now);
      }
    }

    if (before.bidding?.stage !== 'won' && now.bidding?.stage === 'won' && now.bidding.bid) {
      this.write(`${name(now.bidding.bid.factionId)} won bidding round ${now.bidding.round} for ${now.bidding.bid.amount} spice.`, now);
    }
    if (now.spice !== before.spice) {
      this.write(`Your spice reserve: ${now.spice} (was ${before.spice}).`, now);
    }

    this.follow(before, now, grew);
    this.learn(snapshot, now);
    return this.log.slice(start);
  }

  private stamp() {
    return `T${this.turn} ${this.last?.stage === 'play' ? this.last.phaseLabel : (this.last?.stage ?? '')}`.trim();
  }

  /** Where the cards it knew went since the last view. */
  private follow(before: Frame, now: Frame, grew: string[]) {
    const { name } = this.context;
    const newlyFaceUp = added(before.faceUp, now.faceUp);
    const newlyHeld = added(before.hand, now.hand);
    for (const card of this.cards.filter((entry) => !entry.gone)) {
      if (card.pile) {
        const was = before.pieces.get(card.pile.pieceId);
        const is = now.pieces.get(card.pile.pieceId);
        if (is && is.shuffles !== card.pile.shuffles) {
          card.where = `shuffled into ${is.label}`;
          card.pile = undefined;
          continue;
        }
        const taken = (was?.items ?? 0) - (is?.items ?? 0);
        if (taken <= 0) {
          continue;
        }
        if (card.pile.fromTop >= taken) {
          card.pile.fromTop -= taken;
          card.where = card.pile.fromTop === 0 ? `on top of ${is!.label}` : `${card.pile.fromTop + 1} from the top of ${is!.label}`;
          continue;
        }
        /* It left the pile: face up somewhere, or into the hand that grew. */
        card.pile = undefined;
        const shown = newlyFaceUp.indexOf(card.name);
        const mine = newlyHeld.indexOf(card.name);
        if (mine >= 0) {
          newlyHeld.splice(mine, 1);
          card.gone = true;
          card.where = 'in your hand';
        } else if (shown >= 0) {
          newlyFaceUp.splice(shown, 1);
          card.where = 'face up on the table';
        } else if (grew.length) {
          card.holders = grew;
          card.where = grew.length === 1 ? `in ${name(grew[0]!)}'s hand` : `in the hand of ${grew.map(name).join(' or ')}`;
          this.write(`The ${card.name} you knew of went to ${grew.map(name).join(' or ')}.`, now);
        } else {
          card.where = 'taken from its pile, where to is not known';
        }
        continue;
      }
      /* A card a faction held, now played face up by them. */
      const shown = newlyFaceUp.indexOf(card.name);
      if (card.holders.length && shown >= 0 && card.holders.some((holder) => (now.handCounts[holder] ?? 0) < (before.handCounts[holder] ?? 0))) {
        newlyFaceUp.splice(shown, 1);
        card.gone = true;
        card.where = `played face up (${this.stamp()})`;
      }
    }
    /* Cards that left this seat's own hand into another hand. */
    const left = added(now.hand, before.hand);
    const others = grew.filter((faction) => faction !== this.context.me);
    for (const card of left) {
      const shown = newlyFaceUp.indexOf(card);
      if (shown >= 0) {
        newlyFaceUp.splice(shown, 1);
      } else if (others.length) {
        this.cards.push({ name: card, holders: others, where: `in ${others.map(name).join(' or ')}'s hand`, learnt: `gave it away ${this.stamp()}` });
        this.write(`Your ${card} went to ${others.map(name).join(' or ')}.`, now);
      }
    }
  }

  /** Cards this view shows that the ledger did not know: what the seat is peeking at. */
  private learn(snapshot: GameSnapshot, now: Frame) {
    const peek = snapshot.peek?.piece;
    if (!peek) {
      return;
    }
    const shuffles = now.pieces.get(peek.id)?.shuffles ?? 0;
    peek.items.forEach((item, index) => {
      const fromTop = peek.items.length - 1 - index;
      const label = cardName(item, '');
      if (!label) {
        return;
      }
      const existing = this.cards.find((card) => card.pile?.pieceId === peek.id && card.pile.fromTop === fromTop);
      if (existing?.name === label) {
        return;
      }
      if (existing) {
        existing.pile = undefined;
      }
      this.cards.push({
        name: label,
        holders: [],
        where: fromTop === 0 ? `on top of ${peek.label}` : `${fromTop + 1} from the top of ${peek.label}`,
        learnt: `peeked ${this.stamp()}`,
        pile: { pieceId: peek.id, fromTop, shuffles },
      });
      this.write(`You saw ${label} ${fromTop === 0 ? `on top of ${peek.label}` : `${fromTop + 1} from the top of ${peek.label}`}.`, now);
    });
  }

  /** What the seat knows of cards outside its hand, one line per faction or pile, for the brief. */
  knowledge(): string[] {
    const { name } = this.context;
    const held = new Map<string, string[]>();
    const elsewhere: string[] = [];
    for (const card of this.cards.filter((entry) => !entry.gone)) {
      if (card.holders.length) {
        const key = card.holders.map(name).join(' or ');
        held.set(key, [...(held.get(key) ?? []), `${card.name} (${card.learnt})`]);
      } else {
        elsewhere.push(`${card.name} ${card.where} (${card.learnt})`);
      }
    }
    return [
      ...[...held].map(([holder, names]) => `${holder}: ${names.join(', ')}`),
      ...(elsewhere.length ? [`Elsewhere: ${elsewhere.join('; ')}`] : []),
    ];
  }

  /** The log since a point, newest last, cut to `limit` lines with a count of what was left out. */
  since(index: number, limit = 15): string[] {
    const lines = this.log.slice(index);
    const shown = lines.slice(-limit).map((line) => `${line.text}`);
    return lines.length > limit ? [`(${lines.length - limit} earlier changes; \`look log\` has them)`, ...shown] : shown;
  }
}
