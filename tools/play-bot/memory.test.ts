import { expect, it } from 'vite-plus/test';

import type { TablePiece } from '../../src/shared/play/model';
import type { GameSnapshot } from '../../src/shared/play/protocol';
import { SeatMemory } from './memory';

const NAMES: Record<string, string> = { fre: 'Fremen', har: 'Harkonnen', emp: 'Emperor' };

function card(id: string, name?: string, faceUp = false) {
  return {
    id,
    faceUp,
    artwork: name
      ? { back: 'https://dune.zone/back.png', front: 'https://dune.zone/f.png', name, type: 'card-treachery' }
      : { back: 'https://dune.zone/back.png' },
  };
}

function piece(id: string, label: string, items: ReturnType<typeof card>[], extra: Partial<TablePiece> = {}): TablePiece {
  return {
    id,
    label,
    owner: 'shared',
    color: '#000',
    accent: '#000',
    items,
    stackKey: null,
    position: [0, 0, 0],
    orientation: [0, 0, 0],
    zoneId: null,
    locked: false,
    kind: 'card',
    ...extra,
  } as TablePiece;
}

function troops(owner: string, count: number, place: string): TablePiece {
  return piece(`${owner}-${place}`, 'Troop', Array.from({ length: count }, (_, i) => card(`${owner}-${place}-${i}`)), {
    owner,
    kind: 'force',
    stackKey: `troops:${owner}`,
    zoneId: place,
  } as Partial<TablePiece>);
}

type Parts = {
  phase?: number;
  pieces?: TablePiece[];
  hand?: TablePiece[];
  handCounts?: Record<string, number>;
  peek?: TablePiece;
  events?: { id: string; message: string }[];
  bidding?: GameSnapshot['bidding'];
  spice?: number;
};
function snapshot(parts: Parts): GameSnapshot {
  return {
    stage: 'play',
    phase: parts.phase ?? 2,
    revision: 1,
    table: {
      stormSectorIndex: 0,
      pieces: parts.pieces ?? [],
      events: [...(parts.events ?? [])].reverse().map((event) => ({ ...event, command: 'x', status: 'accepted' })),
      nextEventNumber: 1,
    },
    hand: parts.hand ?? [],
    handCounts: parts.handCounts ?? {},
    ...(parts.peek ? { peek: { piece: parts.peek } } : {}),
    ...(parts.bidding ? { bidding: parts.bidding } : {}),
    bank: { factionId: 'fre', balance: parts.spice ?? 10 },
  } as unknown as GameSnapshot;
}

const memory = () =>
  new SeatMemory({ me: 'fre', name: (id) => NAMES[id] ?? id, place: (p) => p.zoneId ?? 'off the board' });

const deck = (...items: ReturnType<typeof card>[]) => piece('deck', 'Treachery deck', items);

it('remembers a peeked card and who took it, as a person at the table would', () => {
  const seat = memory();
  /* Fremen peeks at the top card (the last item) of the Treachery deck. */
  seat.observe(
    snapshot({ pieces: [deck(card('a'), card('b'), card('c'))], peek: deck(card('a', 'Shield'), card('b', 'Snooper'), card('c', 'Lasgun')), handCounts: { fre: 0, har: 1, emp: 0 } }),
    'Bidding'
  );
  expect(seat.knowledge()).toEqual([
    'Elsewhere: Shield 3 from the top of Treachery deck (peeked T1 Bidding); Snooper 2 from the top of Treachery deck (peeked T1 Bidding); Lasgun on top of Treachery deck (peeked T1 Bidding)',
  ]);
  /* The top card leaves the deck, with new ids, and Harkonnen's hand grows: Harkonnen bought the Lasgun. */
  const lines = seat.observe(
    snapshot({
      pieces: [deck(card('x'), card('y'))],
      handCounts: { fre: 0, har: 2, emp: 0 },
      bidding: { seconds: 10, timed: false, started: true, stage: 'won', round: 1, opener: 'emp', turn: null, bid: { factionId: 'har', amount: 4 }, passed: [], deadline: null },
    }),
    'Bidding'
  );
  expect(lines.map((line) => line.text)).toEqual([
    'Harkonnen now holds 2 Treachery cards (was 1).',
    'Harkonnen won bidding round 1 for 4 spice.',
    'The Lasgun you knew of went to Harkonnen.',
  ]);
  expect(seat.knowledge()[0]).toBe('Harkonnen: Lasgun (peeked T1 Bidding)');
  expect(seat.knowledge()[1]).toContain('Snooper on top of Treachery deck');

  /* Harkonnen plays it face up in a battle: no longer held. */
  seat.observe(
    snapshot({ pieces: [deck(card('x'), card('y')), piece('played', 'Treachery card', [card('z', 'Lasgun', true)])], handCounts: { fre: 0, har: 1, emp: 0 } }),
    'Battle'
  );
  expect(seat.knowledge().join('\n')).not.toContain('Harkonnen: Lasgun');
});

it('says only "one of them" when two hands grew at once, and forgets positions on a shuffle', () => {
  const seat = memory();
  seat.observe(snapshot({ pieces: [deck(card('a'), card('b'))], peek: deck(card('a', 'Shield'), card('b', 'Karama')), handCounts: { har: 0, emp: 0 } }), 'Bidding');
  seat.observe(snapshot({ pieces: [deck()], handCounts: { har: 1, emp: 1 } }), 'Bidding');
  expect(seat.knowledge()).toEqual(['Harkonnen or Emperor: Shield (peeked T1 Bidding), Karama (peeked T1 Bidding)']);

  const other = memory();
  other.observe(snapshot({ pieces: [deck(card('a'), card('b'))], peek: deck(card('a', 'Shield'), card('b', 'Karama')) }), 'Bidding');
  other.observe(snapshot({ pieces: [piece('deck', 'Treachery deck', [card('p'), card('q')], { shuffleRevision: 1 })] }), 'Bidding');
  expect(other.knowledge()[0]).toContain('Shield shuffled into Treachery deck');
});

it('keeps a log of every change, counts turns, and cuts long stretches', () => {
  const seat = memory();
  seat.observe(snapshot({ phase: 0, pieces: [troops('emp', 5, 'reserve')] }), 'Storm');
  seat.observe(snapshot({ phase: 5, pieces: [troops('emp', 3, 'Arrakeen'), troops('emp', 2, 'reserve')], events: [{ id: 'e1', message: 'Emperor shipped 3 troops to Arrakeen.' }], spice: 8 }), 'Shipment and Movement');
  seat.observe(snapshot({ phase: 0, pieces: [troops('emp', 3, 'Arrakeen'), troops('emp', 2, 'reserve')], spice: 8 }), 'Storm');
  expect(seat.turn).toBe(2);
  expect(seat.log.map((line) => `T${line.turn} ${line.text}`)).toEqual([
    'T1 Turn 1, Storm phase.',
    'T1 Turn 1, Shipment and Movement phase.',
    'T1 Emperor shipped 3 troops to Arrakeen.',
    "T1 Emperor's Troop in reserve: -3.",
    "T1 Emperor's Troop in Arrakeen: +3.",
    'T1 Your spice reserve: 8 (was 10).',
    'T2 Turn 2, Storm phase.',
  ]);
  expect(seat.since(0, 3)[0]).toBe('(4 earlier changes; `look log` has them)');
});

it('remembers a card it gave away', () => {
  const seat = memory();
  const hand = [piece('h1', 'Treachery card', [card('k', 'Karama', true)], { owner: 'fre' } as Partial<TablePiece>)];
  seat.observe(snapshot({ hand, handCounts: { fre: 1, emp: 0 } }), 'Bidding');
  const lines = seat.observe(snapshot({ hand: [], handCounts: { fre: 0, emp: 1 } }), 'Bidding');
  expect(lines.at(-1)?.text).toBe('Your Karama went to Emperor.');
  expect(seat.knowledge()).toEqual(['Emperor: Karama (gave it away T1 Bidding)']);
});
