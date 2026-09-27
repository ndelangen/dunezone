import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import type { FactionCapture } from './capture';
import { applyPieceAction, initialSnapshot, nextSnapshot } from './commands';
import { freshTableState } from './model';
import type { TablePiece, TableState, Vector3Tuple } from './model';
import { tableForViewer } from './protocol';
import { factionSupply, piece, place } from './setupSupply';
import type { SupplyDependencies } from './setupSupply';
import { stackPreviewPositionFor } from './tableGeometry';
import { applyDraftToState, draftForGesture, renderedPiecesFor } from './tableState';

test('snapshots discard version entries when a split removes its source', () => {
  const previous = initialSnapshot();
  const table = applyPieceAction(
    tableForViewer(previous, 'harkonnen'),
    { kind: 'split', pieceId: 'harkonnen-force-stack', count: 5 },
    previous.phase
  );
  const next = nextSnapshot(previous, table);

  expect(next.table.pieces.some((piece) => piece.id === 'harkonnen-force-stack')).toBe(false);
  expect(next.versions).not.toHaveProperty('harkonnen-force-stack');
  expect(Object.keys(next.versions).sort()).toEqual(next.table.pieces.map((piece) => piece.id).sort());
  expect(previous.versions).toHaveProperty('harkonnen-force-stack', 0);
});

test('revision stamps advance legacy versions while preserving unchanged pieces', () => {
  const previous = { ...initialSnapshot(), revision: 37 };
  previous.versions['retired-piece'] = 12;
  const table = applyPieceAction(
    tableForViewer(previous, 'harkonnen'),
    { kind: 'lock', pieceId: 'harkonnen-force-stack' },
    previous.phase
  );
  const next = nextSnapshot(previous, table);

  expect(next.revision).toBe(38);
  expect(next.versions).toMatchObject({ 'harkonnen-force-stack': 38, 'atreides-force-stack': 0 });
  expect(next.versions).not.toHaveProperty('retired-piece');

  const reset = nextSnapshot(next, freshTableState(), 0, true);
  expect(reset.revision).toBe(39);
  expect(new Set(Object.values(reset.versions))).toEqual(new Set([39]));
});

describe('card decks', () => {
  const TRAITOR_BACK = 'https://table.test/published/cardback-presets/traitor/cardback.jpg';
  const SUPPLIES_BACK = 'https://table.test/published/decks/supplies/cardback.jpg';
  const DREAMRULES_BACK = 'https://table.test/published/decks/dreamrules-treachery-deck/cardback.jpg';
  const SUPPLIES = { back: SUPPLIES_BACK, backName: 'Supplies!' };
  let next = 0;
  const dependencies: SupplyDependencies = { id: () => `supply-${next++}`, shuffle: (items) => items };

  /* One faction's Traitor deck as setup places it, on the published Traitor back. */
  function traitorDeck(factionId: string, angle: number): TablePiece {
    const capture: FactionCapture = {
      faction: { id: factionId, slug: factionId, name: factionId },
      capturedAt: 0,
      definition: assetPublishingFaction,
      components: {
        token: { front: null, back: null },
        leaders: [],
        troops: [],
        alliance: { front: null, back: null },
        traitors: {
          back: TRAITOR_BACK,
          cards: assetPublishingFaction.leaders.map((leader) => ({
            memberId: leader.memberId,
            name: leader.name,
            front: null,
          })),
        },
      },
      extras: [],
      readiness: { ready: true, problems: [] },
    };
    return factionSupply(capture, angle, dependencies).traitors[0]!;
  }

  /* A deck spawned on the table from the catalogue: its own name and stack key, its cards on one back, or on none. */
  function spawnedDeck(
    id: string,
    stackKey: string,
    back: { back: string; backName: string } | null,
    position: Vector3Tuple
  ) {
    return place(
      {
        ...piece(id, `${id} cache`, 'shared', '#d5ba8c', 'card', stackKey),
        items: [0, 1].map((index) => ({
          id: `${id}-${index}`,
          faceUp: false,
          ...(back ? { artwork: { ...back, type: 'card-treachery' } } : {}),
        })),
      },
      position
    );
  }

  /* The drop a player makes by carrying one whole stack onto another, as the table commits it. */
  function dropOnto(state: TableState, pieceId: string, targetId: string): TableState {
    const held = pieceById(state, pieceId)!;
    const target = pieceById(state, targetId)!;
    return applyDraftToState(state, {
      operation: 'merge',
      pieceId,
      sourcePieceId: pieceId,
      pickedUpItemIds: held.items.map((item) => item.id),
      withdrawals: [],
      origin: [...held.position],
      originOrientation: held.orientation,
      position: stackPreviewPositionFor(target),
      orientation: held.orientation,
      targetZoneId: target.zoneId,
      targetPieceId: targetId,
    });
  }

  const pieceById = (state: TableState, id: string) => state.pieces.find((candidate) => candidate.id === id);
  const splitOne = (state: TableState, pieceId: string) =>
    applyPieceAction(state, { kind: 'split', pieceId, count: 1 }, 0);

  test('a Traitor stack is named by its back through a split, a merge and two factions combining', () => {
    const atreides = traitorDeck('atreides', 0);
    const harkonnen = traitorDeck('harkonnen', Math.PI);
    const table = { ...freshTableState(), pieces: [atreides, harkonnen] };

    const split = splitOne(table, atreides.id);
    const card = split.pieces.at(-1)!;
    expect([card.label, pieceById(split, atreides.id)?.label]).toEqual(['Traitor card', 'Traitor deck']);

    const merged = dropOnto(split, card.id, atreides.id);
    expect(pieceById(merged, atreides.id)?.label).toBe('Traitor deck');

    const combined = dropOnto(merged, harkonnen.id, atreides.id);
    expect(pieceById(combined, harkonnen.id)).toBeUndefined();
    expect(pieceById(combined, atreides.id)?.label).toBe('Traitor deck');
    expect(pieceById(combined, atreides.id)?.items).toHaveLength(atreides.items.length + harkonnen.items.length);
  });

  test.each([
    ['a onto b', 'a', 'b'],
    ['b onto a', 'b', 'a'],
  ])("two decks spawned on one back combine and take that back's word, dropped %s", (_order, from, onto) => {
    const table = {
      ...freshTableState(),
      pieces: [spawnedDeck('a', 'deck:a', SUPPLIES, [-3, 0, 6]), spawnedDeck('b', 'deck:b', SUPPLIES, [3, 0, 6])],
    };

    const combined = dropOnto(table, from, onto);

    expect(combined.pieces.map(({ id, label, items }) => ({ id, label, count: items.length }))).toEqual([
      { id: onto, label: 'Supplies! deck', count: 4 },
    ]);
  });

  test.each([
    [
      'a different back address',
      { back: 'https://table.test/published/decks/no-field/cardback.jpg', backName: 'Supplies!' },
    ],
    ['the same address with a different printed word', { back: SUPPLIES_BACK, backName: 'Treachery' }],
    ['one stack with no back at all', null],
  ])('cards whose backs differ stay apart even under one stack key: %s', (_case, back) => {
    const table = {
      ...freshTableState(),
      pieces: [spawnedDeck('a', 'deck:a', SUPPLIES, [-3, 0, 6]), spawnedDeck('b', 'deck:a', back, [3, 0, 6])],
    };

    const dropped = dropOnto(table, 'a', 'b');

    expect(dropped.events[0]?.status).toBe('rejected');
    expect(dropped.pieces).toEqual(table.pieces);
  });

  test("taking a card off one stack leaves every other stack's name as it was", () => {
    const fresh = freshTableState();
    const traitors = traitorDeck('atreides', 0);
    const drawer = {
      ...spawnedDeck('drawer', 'deck:dreamrules', { back: DREAMRULES_BACK, backName: 'Treachery' }, [-25, 0, -25]),
      label: 'Dreamrules Treachery Deck',
      inventory: 'shared' as const,
    };
    const table = { ...fresh, pieces: [...fresh.pieces, traitors, drawer] };
    const deck = pieceById(table, 'treachery-deck')!;
    const peel = draftForGesture(deck, 'top')!;

    const carrying = renderedPiecesFor({ ...table, draftMove: peel });
    const dropped = applyDraftToState(table, { ...peel, position: [deck.position[0] + 2, 0, deck.position[2]] });

    expect(carrying.find((candidate) => candidate.id === traitors.id)?.label).toBe('Traitor cards');
    expect(dropped.events[0]?.status).toBe('accepted');
    expect(pieceById(dropped, traitors.id)?.label).toBe('Traitor cards');
    expect(pieceById(dropped, drawer.id)?.label).toBe('Dreamrules Treachery Deck');
  });
});
